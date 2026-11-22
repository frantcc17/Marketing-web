import "dotenv/config";
import express from "express";
import { createServer } from "node:http";
import { networkInterfaces } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import QRCode from "qrcode";
import { Server } from "socket.io";
import { Room, makeRoomCode } from "./game/room.js";
import { iaDisponible } from "./game/aria.js";
import { CONFIG, CONSUMIDORA, LEVERS, PRIVATE_LABEL, PRODUCTS, RETAILER, ROUNDS } from "./data/game.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const PORT = Number(process.env.PORT) || 3000;
const isProd = process.env.NODE_ENV === "production";

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, { cors: { origin: true } });

const rooms = new Map<string, Room>();

function lanIp(): string | null {
  for (const list of Object.values(networkInterfaces())) {
    for (const ni of list ?? []) {
      if (ni.family === "IPv4" && !ni.internal && !ni.address.startsWith("169.254")) return ni.address;
    }
  }
  return null;
}

function publicBase(origin: string | undefined): string {
  if (process.env.PUBLIC_URL) return process.env.PUBLIC_URL.replace(/\/$/, "");
  try {
    const u = new URL(origin ?? "");
    if (["localhost", "127.0.0.1", "::1", "[::1]"].includes(u.hostname)) {
      const ip = lanIp();
      if (ip) return `${u.protocol}//${ip}:${u.port || PORT}`;
    }
    return u.origin;
  } catch {
    return `http://${lanIp() ?? "localhost"}:${PORT}`;
  }
}

function broadcast(room: Room): void {
  io.to(`host:${room.code}`).emit("host:state", room.hostState());
  for (const p of room.players.values()) {
    const state = room.playState(p.id);
    for (const sid of p.sockets) io.to(sid).emit("play:state", state);
  }
  io.to(`lobby:${room.code}`).emit("play:state", room.playState(null));
}

async function createRoom(origin: string | undefined): Promise<Room> {
  const code = makeRoomCode(new Set(rooms.keys()));
  const room: Room = new Room(code, () => broadcast(room));
  room.joinUrl = `${publicBase(origin)}/play?sala=${code}`;
  room.qr = await QRCode.toDataURL(room.joinUrl, { margin: 1, width: 360, color: { dark: "#12141C", light: "#F3F1EA" } });
  rooms.set(code, room);
  return room;
}

const normCode = (c: unknown) => (typeof c === "string" ? c.trim().toUpperCase() : "");

io.on("connection", (socket) => {
  const origin = socket.handshake.headers.origin;

  socket.on("host:create", async (_: unknown, ack?: (r: unknown) => void) => {
    const room = await createRoom(origin);
    socket.join(`host:${room.code}`);
    ack?.({ ok: true, code: room.code });
    broadcast(room);
  });

  socket.on("host:attach", (data: { code?: string }, ack?: (r: unknown) => void) => {
    const room = rooms.get(normCode(data?.code));
    if (!room) return ack?.({ ok: false });
    socket.join(`host:${room.code}`);
    ack?.({ ok: true, code: room.code });
    socket.emit("host:state", room.hostState());
  });

  socket.on("host:action", async (data: { code?: string; action?: string; value?: number }) => {
    const room = rooms.get(normCode(data?.code));
    if (!room || !socket.rooms.has(`host:${room.code}`)) return;
    switch (data.action) {
      case "start": {
        const err = room.startRound();
        if (err) socket.emit("host:error", err);
        break;
      }
      case "addTime": room.addTime(); break;
      case "close": await room.closeRound(); break;
      case "retry": await room.runAria(); break;
      case "reveal": room.reveal(); break;
      case "next": room.nextRound(); break;
      case "reset": room.reset(); break;
      case "demo": room.fillBots(); break;
      case "prepSeconds": room.setPrepSeconds(Number(data.value)); break;
    }
  });

  socket.on("play:watch", (data: { code?: string }, ack?: (r: unknown) => void) => {
    const room = rooms.get(normCode(data?.code));
    if (!room) return ack?.({ ok: false, error: "No existe esa sala." });
    socket.join(`lobby:${room.code}`);
    ack?.({ ok: true });
    socket.emit("play:state", room.playState(null));
  });

  socket.on("play:join", (data: { code?: string; name?: string; teamId?: string }, ack?: (r: unknown) => void) => {
    const room = rooms.get(normCode(data?.code));
    if (!room) return ack?.({ ok: false, error: "No existe esa sala." });
    const { player, error } = room.join(String(data.name ?? ""), String(data.teamId ?? ""));
    if (!player) return ack?.({ ok: false, error });
    socket.leave(`lobby:${room.code}`);
    socket.data = { code: room.code, playerId: player.id };
    room.attachSocket(player.id, socket.id);
    ack?.({ ok: true, playerId: player.id });
  });

  socket.on("play:resume", (data: { code?: string; playerId?: string }, ack?: (r: unknown) => void) => {
    const room = rooms.get(normCode(data?.code));
    const player = room && data?.playerId ? room.attachSocket(data.playerId, socket.id) : undefined;
    if (!room || !player) return ack?.({ ok: false });
    socket.data = { code: room.code, playerId: player.id };
    ack?.({ ok: true });
  });

  socket.on("play:draft", (data: { message?: unknown; levers?: unknown }) => {
    const room = rooms.get(socket.data?.code);
    if (room && socket.data?.playerId) room.updateDraft(socket.data.playerId, data?.message, data?.levers);
  });

  socket.on("play:submit", () => {
    const room = rooms.get(socket.data?.code);
    if (room && socket.data?.playerId) room.submit(socket.data.playerId);
  });

  socket.on("disconnect", () => {
    for (const room of rooms.values()) room.detachSocket(socket.id);
  });
});

setInterval(() => {
  for (const room of rooms.values()) room.tick();
}, 500);

app.get("/api/health", (_req, res) => res.json({ ok: true, ia: iaDisponible(), rooms: rooms.size }));

// Configuración pública para el cliente (sin las pistas secretas).
app.get("/api/config", (_req, res) =>
  res.json({
    products: [...PRODUCTS, PRIVATE_LABEL],
    levers: LEVERS,
    rounds: ROUNDS.map(({ pista: _pista, ...r }) => r),
    config: CONFIG,
    retailer: RETAILER,
    consumidora: CONSUMIDORA,
  }),
);

async function start() {
  if (isProd) {
    const dist = path.join(ROOT, "dist", "client");
    app.use(express.static(dist));
    app.get("*", (_req, res) => res.sendFile(path.join(dist, "index.html")));
  } else {
    const { createServer: createVite } = await import("vite");
    const vite = await createVite({
      configFile: path.join(ROOT, "vite.config.ts"),
      server: { middlewareMode: true, hmr: { server: httpServer } },
      appType: "spa",
    });
    app.use(vite.middlewares);
  }
  httpServer.listen(PORT, "0.0.0.0", () => {
    const ip = lanIp();
    console.log("\n  Convence al algoritmo");
    console.log(`  Profesor (proyector): http://localhost:${PORT}/host`);
    if (ip) console.log(`  Alumnos en la misma wifi: http://${ip}:${PORT}/play`);
    console.log(`  ARIA: ${iaDisponible() ? `IA (${process.env.ARIA_MODEL || "claude-sonnet-5-5"})` : "motor de respaldo (sin ANTHROPIC_API_KEY)"}\n`);
  });
}

void start();
