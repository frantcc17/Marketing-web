// Almacenamiento de las partidas.
// - En Vercel: Upstash Redis (las funciones serverless no comparten memoria).
// - En local sin Redis: memoria del proceso.
import { Redis } from "@upstash/redis";
import { createClient, type RedisClientType } from "redis";
import type { RoomData } from "./game/room.js";

export interface Stored {
  data: RoomData;
  v: number;
}

export interface Store {
  kind: "redis" | "memory";
  get(code: string): Promise<Stored | null>;
  /** Guarda solo si la versión no ha cambiado (v = 0 crea la sala si no existe). */
  cas(code: string, v: number, data: RoomData): Promise<boolean>;
  lock(key: string, ttlSec: number): Promise<boolean>;
  seenAll(code: string): Promise<Record<string, number>>;
  seen(code: string, playerId: string, ts: number): Promise<void>;
}

const TTL = 60 * 60 * 12; // las partidas caducan a las 12 h

const CAS_SCRIPT = `
local cur = redis.call('HGET', KEYS[1], 'v')
if (cur == false and ARGV[1] == '0') or cur == ARGV[1] then
  redis.call('HSET', KEYS[1], 'v', tonumber(ARGV[1]) + 1, 'data', ARGV[2])
  redis.call('EXPIRE', KEYS[1], ${TTL})
  return 1
end
return 0`;

class RedisStore implements Store {
  kind = "redis" as const;
  constructor(private r: Redis) {}
  async get(code: string) {
    const h = await this.r.hgetall<Record<string, string>>(`room:${code}`);
    if (!h || !h.data) return null;
    return { data: JSON.parse(h.data) as RoomData, v: Number(h.v) };
  }
  async cas(code: string, v: number, data: RoomData) {
    const ok = await this.r.eval(CAS_SCRIPT, [`room:${code}`], [String(v), JSON.stringify(data)]);
    return Number(ok) === 1;
  }
  async lock(key: string, ttlSec: number) {
    return (await this.r.set(`lock:${key}`, "1", { nx: true, ex: ttlSec })) === "OK";
  }
  async seenAll(code: string) {
    const h = await this.r.hgetall<Record<string, string>>(`seen:${code}`);
    return Object.fromEntries(Object.entries(h ?? {}).map(([k, val]) => [k, Number(val)]));
  }
  async seen(code: string, playerId: string, ts: number) {
    await this.r.hset(`seen:${code}`, { [playerId]: String(ts) });
    await this.r.expire(`seen:${code}`, TTL);
  }
}

class MemoryStore implements Store {
  kind = "memory" as const;
  private rooms = new Map<string, { json: string; v: number }>();
  private locks = new Map<string, number>();
  private seenMap = new Map<string, Record<string, number>>();
  async get(code: string) {
    const r = this.rooms.get(code);
    return r ? { data: JSON.parse(r.json) as RoomData, v: r.v } : null;
  }
  async cas(code: string, v: number, data: RoomData) {
    const cur = this.rooms.get(code)?.v ?? 0;
    if (cur !== v) return false;
    this.rooms.set(code, { json: JSON.stringify(data), v: v + 1 });
    return true;
  }
  async lock(key: string, ttlSec: number) {
    const now = Date.now();
    if ((this.locks.get(key) ?? 0) > now) return false;
    this.locks.set(key, now + ttlSec * 1000);
    return true;
  }
  async seenAll(code: string) {
    return { ...(this.seenMap.get(code) ?? {}) };
  }
  async seen(code: string, playerId: string, ts: number) {
    this.seenMap.set(code, { ...(this.seenMap.get(code) ?? {}), [playerId]: ts });
  }
}

class TcpRedisStore implements Store {
  kind = "redis" as const;
  private ready: Promise<RedisClientType>;
  constructor(url: string) {
    const client = createClient({ url, socket: { connectTimeout: 8000 } }) as unknown as RedisClientType;
    client.on("error", (e: unknown) => console.error("[redis]", e));
    this.ready = client.connect().then(() => client);
  }
  async get(code: string) {
    const h = (await (await this.ready).hGetAll(`room:${code}`)) as Record<string, string>;
    if (!h || !h.data) return null;
    return { data: JSON.parse(h.data) as RoomData, v: Number(h.v) };
  }
  async cas(code: string, v: number, data: RoomData) {
    const ok = await (await this.ready).eval(CAS_SCRIPT, { keys: [`room:${code}`], arguments: [String(v), JSON.stringify(data)] });
    return Number(ok) === 1;
  }
  async lock(key: string, ttlSec: number) {
    const r = await (await this.ready).set(`lock:${key}`, "1", { condition: "NX", expiration: { type: "EX", value: ttlSec } });
    return r === "OK";
  }
  async seenAll(code: string) {
    const h = (await (await this.ready).hGetAll(`seen:${code}`)) as Record<string, string>;
    return Object.fromEntries(Object.entries(h ?? {}).map(([k, val]) => [k, Number(val)]));
  }
  async seen(code: string, playerId: string, ts: number) {
    const c = await this.ready;
    await c.hSet(`seen:${code}`, playerId, String(ts));
    await c.expire(`seen:${code}`, TTL);
  }
}

type RedisConfig = { kind: "rest"; url: string; token: string; via: string } | { kind: "tcp"; url: string; via: string };

/**
 * Busca la conexión a Redis entre las variables de entorno, con o sin prefijo
 * (Vercel puede crearlas como KV_REST_API_URL, STORAGE_KV_REST_API_URL, UPSTASH_REDIS_REST_URL, REDIS_URL…).
 */
export function findRedisConfig(env: Record<string, string | undefined> = process.env): RedisConfig | null {
  const keys = Object.keys(env).filter((k) => env[k]);
  const restUrlKey = keys.find((k) => /(^|_)(KV_REST_API_URL|REDIS_REST_URL)$/.test(k) && env[k]!.startsWith("https://"));
  if (restUrlKey) {
    const prefix = restUrlKey.replace(/(KV_REST_API_URL|REDIS_REST_URL)$/, "");
    const base = restUrlKey.endsWith("KV_REST_API_URL") ? "KV_REST_API_TOKEN" : "REDIS_REST_TOKEN";
    const token = env[prefix + base] ?? keys.filter((k) => /(KV_REST_API_TOKEN|REDIS_REST_TOKEN)$/.test(k) && !/READ_ONLY/.test(k)).map((k) => env[k])[0];
    if (token) return { kind: "rest", url: env[restUrlKey]!, token, via: restUrlKey };
  }
  const tcpKey = keys.find((k) => /(^|_)(REDIS_URL|KV_URL)$/.test(k) && (env[k]!.startsWith("redis://") || env[k]!.startsWith("rediss://")));
  if (tcpKey) {
    const raw = env[tcpKey]!;
    try {
      const u = new URL(raw);
      // Upstash: la URL TCP lleva la contraseña, que es también el token REST.
      if (u.hostname.endsWith("upstash.io") && u.password) {
        return { kind: "rest", url: `https://${u.hostname}`, token: decodeURIComponent(u.password), via: tcpKey };
      }
    } catch {
      /* URL no estándar: se usa tal cual por TCP */
    }
    return { kind: "tcp", url: raw, via: tcpKey };
  }
  return null;
}

/** Nombres (nunca valores) de las variables relacionadas con Redis, para diagnosticar. */
export function redisEnvNames(env: Record<string, string | undefined> = process.env): string[] {
  return Object.keys(env).filter((k) => /(REDIS|KV_|UPSTASH)/.test(k) && env[k]).sort();
}

let store: Store | null = null;

export function redisConfigured(): boolean {
  return !!findRedisConfig();
}

export function getStore(): Store {
  if (store) return store;
  const cfg = findRedisConfig();
  if (cfg?.kind === "rest") {
    store = new RedisStore(new Redis({ url: cfg.url, token: cfg.token, automaticDeserialization: false }));
  } else if (cfg?.kind === "tcp") {
    store = new TcpRedisStore(cfg.url);
  } else {
    store = new MemoryStore();
  }
  return store;
}

export function setStore(s: Store): void {
  store = s;
}

export function memoryStore(): Store {
  return new MemoryStore();
}
