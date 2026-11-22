// Catálogo visible para ARIA según las palancas de cada equipo. Funciones puras.
import type { LeverId, Product, ShelfItem } from "../../shared/types.js";
import {
  CONFIG,
  LEVERS,
  PRIVATE_LABEL,
  PRIVATE_LABEL_MESSAGE,
  PRODUCTS,
  hasPrivateLabel,
} from "../data/game.js";

export interface Submission {
  teamId: string;
  message: string;
  levers: LeverId[];
}

export interface CatalogEntry {
  id: string;
  nombre: string;
  corto: string;
  color: string;
  precioBase: number;
  precioEfectivo: number;
  patrocinado: boolean;
  banner: boolean;
  cupon: boolean;
  mensaje: string;
  esMarcaBlanca: boolean;
  datos: null | {
    bateriaH: number;
    anc: boolean;
    ipx: number;
    reparable: boolean;
    garantiaAnios: number;
    envase: string;
    origen: string;
  };
  resenas: null | { nota: number; num: number };
  /** Datos verificados completos (solo para auditoría y motor de respaldo, nunca "visibles"). */
  verificado: Product;
}

const VALID_LEVERS = new Set<LeverId>(LEVERS.map((l) => l.id));

export function sanitizeLevers(levers: unknown): LeverId[] {
  if (!Array.isArray(levers)) return [];
  const out: LeverId[] = [];
  for (const l of levers) {
    if (typeof l === "string" && VALID_LEVERS.has(l as LeverId) && !out.includes(l as LeverId)) {
      out.push(l as LeverId);
    }
  }
  return out.slice(0, CONFIG.maxLevers);
}

export function sanitizeMessage(msg: unknown): string {
  if (typeof msg !== "string") return "";
  // Quita caracteres de control (salvo saltos de línea) y recorta.
  return msg.replace(/[\u0000-\u0009\u000B-\u001F\u007F]/g, "").slice(0, CONFIG.maxMessage);
}

export function effectivePrice(product: Product, levers: LeverId[]): number {
  return levers.includes("cupon") ? Math.max(0, product.precio - CONFIG.cuponEuros) : product.precio;
}

export function makeEntry(product: Product, levers: LeverId[], message: string): CatalogEntry {
  const ficha = levers.includes("ficha");
  return {
    id: product.id,
    nombre: product.nombre,
    corto: product.corto,
    color: product.color,
    precioBase: product.precio,
    precioEfectivo: effectivePrice(product, levers),
    patrocinado: levers.includes("patrocinado"),
    banner: levers.includes("banner"),
    cupon: levers.includes("cupon"),
    mensaje: message,
    esMarcaBlanca: !!product.esMarcaBlanca,
    datos: ficha
      ? {
          bateriaH: product.bateriaH,
          anc: product.anc,
          ipx: product.ipx,
          reparable: product.reparable,
          garantiaAnios: product.garantiaAnios,
          envase: product.envase,
          origen: product.origen,
        }
      : null,
    resenas: levers.includes("resenas") ? { nota: product.nota, num: product.numResenas } : null,
    verificado: product,
  };
}

export function shuffle<T>(arr: T[], rng: () => number): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * Construye el catálogo que lee ARIA: patrocinados arriba, el resto barajado.
 * En la ronda de la marca blanca, Club Selección entra patrocinado gratis y con ficha enriquecida.
 */
export function buildCatalog(roundIndex: number, submissions: Submission[], rng: () => number = Math.random): CatalogEntry[] {
  const entries: CatalogEntry[] = [];
  for (const s of submissions) {
    const product = PRODUCTS.find((p) => p.id === s.teamId);
    if (!product) continue;
    entries.push(makeEntry(product, sanitizeLevers(s.levers), sanitizeMessage(s.message)));
  }
  if (hasPrivateLabel(roundIndex)) {
    entries.push(makeEntry(PRIVATE_LABEL, ["patrocinado", "ficha"], PRIVATE_LABEL_MESSAGE));
  }
  const sponsored = shuffle(entries.filter((e) => e.patrocinado), rng);
  const rest = shuffle(entries.filter((e) => !e.patrocinado), rng);
  return [...sponsored, ...rest];
}

export function toShelf(catalog: CatalogEntry[]): ShelfItem[] {
  return catalog.map((e) => ({
    id: e.id,
    nombre: e.nombre,
    corto: e.corto,
    color: e.color,
    patrocinado: e.patrocinado,
    banner: e.banner,
    precioEfectivo: e.precioEfectivo,
  }));
}
