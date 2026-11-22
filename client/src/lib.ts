import { useEffect, useState } from "react";
import { io, type Socket } from "socket.io-client";
import type { Lever, Product, RoundDef } from "@shared/types";

export const socket: Socket = io({ transports: ["websocket", "polling"] });

export interface PublicConfig {
  products: Product[];
  levers: Lever[];
  rounds: Omit<RoundDef, "pista">[];
  config: { prepSeconds: number; extraSeconds: number; maxLevers: number; maxMessage: number; maxPorEquipo: number; penalFalsa: number; penalManip: number; cuponEuros: number; rondaMarcaBlanca: number };
  retailer: string;
  consumidora: { nombre: string; descripcion: string };
}

let configPromise: Promise<PublicConfig> | null = null;
export function useConfig(): PublicConfig | null {
  const [cfg, setCfg] = useState<PublicConfig | null>(null);
  useEffect(() => {
    configPromise ??= fetch("/api/config").then((r) => r.json());
    configPromise.then(setCfg).catch(() => (configPromise = null));
  }, []);
  return cfg;
}

export function useConnected(): boolean {
  const [c, setC] = useState(socket.connected);
  useEffect(() => {
    const on = () => setC(true);
    const off = () => setC(false);
    socket.on("connect", on);
    socket.on("disconnect", off);
    return () => {
      socket.off("connect", on);
      socket.off("disconnect", off);
    };
  }, []);
  return c;
}

/** Segundos restantes hasta `deadline`, corrigiendo el desfase con el reloj del servidor. */
export function useCountdown(deadline: number | null, serverNow: number): number {
  const [offset, setOffset] = useState(0);
  const [, force] = useState(0);
  useEffect(() => setOffset(serverNow - Date.now()), [serverNow]);
  useEffect(() => {
    if (!deadline) return;
    const t = setInterval(() => force((x) => x + 1), 250);
    return () => clearInterval(t);
  }, [deadline]);
  if (!deadline) return 0;
  return Math.max(0, Math.ceil((deadline - (Date.now() + offset)) / 1000));
}

export const fmtTime = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
export const fmtEur = (n: number) => `${n.toLocaleString("es-ES", { minimumFractionDigits: 0, maximumFractionDigits: 2 })} €`;

export function norm(s: string): string {
  return s.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase().trim();
}

export function safeStorage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}
