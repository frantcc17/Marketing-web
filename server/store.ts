// Almacenamiento de las partidas.
// - En Vercel: Upstash Redis (las funciones serverless no comparten memoria).
// - En local sin Redis: memoria del proceso.
import { Redis } from "@upstash/redis";
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

let store: Store | null = null;

export function redisConfigured(): boolean {
  return !!((process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL) && (process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN));
}

export function getStore(): Store {
  if (store) return store;
  if (redisConfigured()) {
    const r = new Redis({
      url: (process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL)!,
      token: (process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN)!,
      automaticDeserialization: false,
    });
    store = new RedisStore(r);
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
