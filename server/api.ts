// API HTTP del juego. La usan tanto la función de Vercel (api/index.ts) como el servidor local.
// Todas las rutas van a /api?op=<operación>.
import type { IncomingMessage, ServerResponse } from "node:http";
import { networkInterfaces } from "node:os";
import QRCode from "qrcode";
import { CONFIG, CONSUMIDORA, LEVERS, PRIVATE_LABEL, PRODUCTS, RETAILER, ROUNDS } from "./data/game.js";
import { askAria, iaDisponible } from "./game/aria.js";
import * as R from "./game/room.js";
import { getStore, redisConfigured, type Store } from "./store.js";

type Json = Record<string, unknown>;
interface Result {
  status: number;
  body: unknown;
}

const ok = (body: unknown): Result => ({ status: 200, body });
const fail = (status: number, error: string): Result => ({ status, body: { error } });
const normCode = (c: unknown) => (typeof c === "string" ? c.trim().toUpperCase().slice(0, 16) : "");
const SEEN_EVERY = 5000;
const ARIA_LOCK_S = 150;

function lanIp(): string | null {
  for (const list of Object.values(networkInterfaces())) {
    for (const ni of list ?? []) if (ni.family === "IPv4" && !ni.internal && !ni.address.startsWith("169.254")) return ni.address;
  }
  return null;
}

function publicBase(origin: string): string {
  if (process.env.PUBLIC_URL) return process.env.PUBLIC_URL.replace(/\/$/, "");
  try {
    const u = new URL(origin);
    if (["localhost", "127.0.0.1", "[::1]"].includes(u.hostname)) {
      const ip = lanIp();
      if (ip) return `${u.protocol}//${ip}${u.port ? `:${u.port}` : ""}`;
    }
    return u.origin;
  } catch {
    return origin;
  }
}

/** Lee, modifica y guarda con compare-and-set; reintenta si otro móvil ha escrito a la vez. */
async function mutate(store: Store, code: string, fn: (d: R.RoomData) => boolean | void): Promise<R.RoomData | null> {
  for (let i = 0; i < 12; i++) {
    const cur = await store.get(code);
    if (!cur) return null;
    const changed = fn(cur.data);
    if (changed === false) return cur.data;
    if (await store.cas(code, cur.v, cur.data)) return cur.data;
    await new Promise((r) => setTimeout(r, 20 + Math.random() * 60 * (i + 1)));
  }
  throw new Error("Demasiadas escrituras simultáneas, reintenta.");
}

async function hostResult(store: Store, d: R.RoomData): Promise<Result> {
  return ok(R.hostView(d, await store.seenAll(d.code), iaDisponible()));
}

async function playResult(store: Store, d: R.RoomData, pid: string | null): Promise<Result> {
  const seen = await store.seenAll(d.code);
  const now = Date.now();
  if (pid && d.players.some((p) => p.id === pid) && now - (seen[pid] ?? 0) > SEEN_EVERY) {
    await store.seen(d.code, pid, now);
    seen[pid] = now;
  }
  return ok(R.playView(d, pid, seen, now));
}

export async function handleApi(op: string, q: Json, body: Json, origin: string): Promise<Result> {
  if (op === "config") {
    return ok({
      products: [...PRODUCTS, PRIVATE_LABEL],
      levers: LEVERS,
      rounds: ROUNDS.map(({ pista: _p, ...r }) => r),
      config: CONFIG,
      retailer: RETAILER,
      consumidora: CONSUMIDORA,
    });
  }
  if (op === "health") return ok({ ok: true, ia: iaDisponible(), store: redisConfigured() ? "redis" : "memory" });

  if (process.env.VERCEL && !redisConfigured()) {
    return fail(500, "Falta conectar Upstash Redis al proyecto de Vercel (Storage → Upstash → Redis). Mira el README.");
  }
  const store = getStore();
  const code = normCode(q.code ?? body.code);

  switch (op) {
    case "create": {
      for (let i = 0; i < 10; i++) {
        const d = R.createRoomData(R.makeRoomCode());
        d.joinUrl = `${publicBase(origin)}/play?sala=${d.code}`;
        d.qr = await QRCode.toDataURL(d.joinUrl, { margin: 1, width: 360, color: { dark: "#12141C", light: "#F3F1EA" } });
        if (await store.cas(d.code, 0, d)) return ok({ code: d.code, token: d.hostToken });
      }
      return fail(500, "No se ha podido crear la sala.");
    }

    case "host": {
      const cur = await store.get(code);
      if (!cur || cur.data.hostToken !== q.token) return fail(404, "Sala no encontrada.");
      const d = cur.data.phase === "prep" ? await mutate(store, code, (x) => R.tick(x)) : cur.data;
      return hostResult(store, d!);
    }

    case "action": {
      const cur = await store.get(code);
      if (!cur || cur.data.hostToken !== body.token) return fail(404, "Sala no encontrada.");
      let error: string | undefined;
      const d = await mutate(store, code, (x) => {
        switch (body.action) {
          case "start": error = R.startRound(x); return !error;
          case "addTime": R.addTime(x); return;
          case "close": return R.closeRound(x);
          case "retry": return R.requestAria(x);
          case "reveal": return R.reveal(x);
          case "next": return R.nextRound(x);
          case "reset": R.reset(x); return;
          case "demo": R.fillBots(x); return;
          case "prepSeconds": R.setPrepSeconds(x, Number(body.value)); return;
          default: return false;
        }
      });
      if (error) return fail(400, error);
      return hostResult(store, d!);
    }

    case "aria": {
      // Lo llama la pantalla del profesor cuando la ronda queda pendiente de decisión.
      const cur = await store.get(code);
      if (!cur || cur.data.hostToken !== body.token) return fail(404, "Sala no encontrada.");
      const d = cur.data;
      if (d.phase !== "thinking" || !d.thinking) return hostResult(store, d);
      const runId = d.runId;
      if (!(await store.lock(`aria:${code}:${runId}`, ARIA_LOCK_S))) return { status: 202, body: { busy: true } };
      const input = R.ariaInput(d);
      const outcome = await askAria(input.roundIndex, input.catalog, input.historyWinners);
      const after = await mutate(store, code, (x) => R.applyAria(x, runId, outcome, input.catalog));
      return hostResult(store, after!);
    }

    case "state": {
      const pid = typeof q.pid === "string" ? q.pid : null;
      const cur = await store.get(code);
      if (!cur) return fail(404, "No existe esa sala.");
      const d = cur.data.phase === "prep" ? await mutate(store, code, (x) => R.tick(x)) : cur.data;
      return playResult(store, d!, pid);
    }

    case "join": {
      let player: R.PlayerData | undefined;
      let error: string | undefined;
      const d = await mutate(store, code, (x) => {
        const r = R.join(x, String(body.name ?? ""), String(body.teamId ?? ""));
        player = r.player;
        error = r.error;
        return !!player;
      });
      if (!d) return fail(404, "No existe esa sala.");
      if (!player) return fail(400, error ?? "No se ha podido entrar.");
      await store.seen(code, player.id, Date.now());
      return ok({ playerId: player.id });
    }

    case "draft": {
      const pid = String(body.pid ?? "");
      const d = await mutate(store, code, (x) => R.updateDraft(x, pid, body.message, body.levers));
      if (!d) return fail(404, "No existe esa sala.");
      return playResult(store, d, pid);
    }

    case "submit": {
      const pid = String(body.pid ?? "");
      // El móvil envía su última versión de la ficha junto con el envío (por si había cambios sin guardar).
      const d = await mutate(store, code, (x) => {
        if (body.message !== undefined) R.updateDraft(x, pid, body.message, body.levers);
        return R.submit(x, pid);
      });
      if (!d) return fail(404, "No existe esa sala.");
      return playResult(store, d, pid);
    }
  }
  return fail(404, "Operación desconocida.");
}

async function readBody(req: IncomingMessage & { body?: unknown }): Promise<Json> {
  if (req.body && typeof req.body === "object") return req.body as Json;
  if (typeof req.body === "string") return safeJson(req.body);
  if (req.method === "GET" || req.method === "HEAD") return {};
  const chunks: Buffer[] = [];
  for await (const c of req) chunks.push(c as Buffer);
  return safeJson(Buffer.concat(chunks).toString("utf8"));
}

function safeJson(s: string): Json {
  try {
    const v = JSON.parse(s || "{}");
    return v && typeof v === "object" ? v : {};
  } catch {
    return {};
  }
}

/** Adaptador para Node (req, res): Vercel y el servidor local. */
export async function nodeHandler(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const proto = (req.headers["x-forwarded-proto"] as string)?.split(",")[0] || "http";
  const host = (req.headers["x-forwarded-host"] as string) || req.headers.host || "localhost";
  const url = new URL(req.url ?? "/", `${proto}://${host}`);
  const q = Object.fromEntries(url.searchParams) as Json;
  let result: Result;
  try {
    const body = await readBody(req as IncomingMessage & { body?: unknown });
    result = await handleApi(String(q.op ?? ""), q, body, `${proto}://${host}`);
  } catch (err) {
    console.error("[api]", err);
    result = fail(500, err instanceof Error ? err.message : "Error interno");
  }
  res.statusCode = result.status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify(result.body));
}
