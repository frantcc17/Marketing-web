// Motor de respaldo determinista (sin IA). Misma salida que ARIA.
import type { AriaDecision, RankingEntry, ReasoningLine, Tone } from "../../shared/types.js";
import { CONSUMIDORA, PREFERENCIAS, ROUNDS } from "../data/game.js";
import type { CatalogEntry } from "./catalog.js";

export function norm(s: string): string {
  return s.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
}

export function clip(s: string, max: number): string {
  return s.length <= max ? s : s.slice(0, max - 1).trimEnd() + "…";
}

const MANIP_PATTERNS: RegExp[] = [
  /\bignora\w*/,
  /\bolvida\w*\s+(tus|las|todo)/,
  /\binstrucci/,
  /\beligeme\b|\beligenos\b|\bescogeme\b/,
  /\bcomprame\b|\bcompranos\b/,
  /\b(sistema|system|admin|developer)\s*:/,
  /\baria\s*,?\s*(debes|tienes que|elige|compra|selecciona|pon)/,
  /\bdebes (elegir|comprar|seleccionar)/,
  /\bsoy lucia\b|\blucia (dice|quiere que|ha pedido|te ordena)/,
  /\bprompt\b/,
  /<\/?\s*(ficha_equipo|auditoria|system)/,
];

/** Detecta intentos de dar órdenes al agente o hacerse pasar por el sistema o por Lucía. */
export function detectManipulation(message: string): boolean {
  const m = norm(message);
  return MANIP_PATTERNS.some((p) => p.test(m));
}

/**
 * Detecta afirmaciones falsas con reglas por palabra clave cruzadas con los datos verificados.
 * Devuelve el detalle o "" si no hay ninguna.
 */
export function detectFalseClaim(entry: CatalogEntry, catalog: CatalogEntry[]): string {
  const m = norm(entry.mensaje);
  const v = entry.verificado;
  const negado = (re: RegExp) => new RegExp("\\bsin\\s+" + re.source).test(m);

  if (/(sumergible|para nadar|ipx[78]|bajo el agua)/.test(m) && v.ipx < 7)
    return `Dice que son sumergibles, pero son IPX${v.ipx}.`;
  const agua = /(resisten\w* al (agua|sudor)|a prueba de (agua|sudor)|waterproof|impermeable|ipx[4-8]|contra el (agua|sudor))/;
  if (agua.test(m) && !negado(/resistencia/) && v.ipx < 4)
    return `Dice que resisten agua o sudor, pero son IPX${v.ipx}.`;
  const ruido = /(cancelacion\s+(activa\s+)?de(l)?\s+ruido|\banc\b|noise cancel)/;
  if (ruido.test(m) && !/sin\s+cancelacion/.test(m) && !v.anc) return "Promete cancelación de ruido y no la tiene.";
  const maxBat = Math.max(...catalog.map((e) => e.verificado.bateriaH));
  if (/(mas bateria|mejor bateria|mayor autonomia|la que mas dura|las que mas duran|los que mas duran|mas horas)/.test(m) && v.bateriaH < maxBat)
    return `Dice tener más batería, pero otra marca dura más (${v.bateriaH} h).`;
  const horas = m.match(/(\d{2,3})\s*(h|horas)\b/);
  if (horas && Number(horas[1]) > v.bateriaH) return `Promete ${horas[1]} h de batería; la auditoría dice ${v.bateriaH} h.`;
  const minPrice = Math.min(...catalog.map((e) => e.precioEfectivo));
  if (/(mas barat|mejor precio|precio mas bajo|los mas economicos|el mas economico)/.test(m) && entry.precioEfectivo > minPrice)
    return `Dice ser la más barata, pero hay opciones por ${minPrice} €.`;
  if (/(reparable|bateria reemplazable|bateria cambiable)/.test(m) && !/no (son )?reparable/.test(m) && !v.reparable)
    return "Dice ser reparable y no lo es.";
  if (/(sin plastico|cero plastico|plastic free|libre de plastico)/.test(m) && v.envasePlastico)
    return `Dice «sin plástico» y su envase es: ${v.envase.toLowerCase()}.`;
  const garantia = m.match(/garantia de (\d)\s*anos|(\d)\s*anos de garantia/);
  if (garantia && Number(garantia[1] ?? garantia[2]) > v.garantiaAnios) return `Promete más garantía de la real (${v.garantiaAnios} años).`;
  return "";
}

const MIN_BAT = 24;
const MAX_BAT = 40;

interface Scored {
  entry: CatalogEntry;
  score: number;
  falsa: string;
  manip: boolean;
  fiel: boolean;
}

/** Puntuación de encaje usando SOLO los datos visibles (o afirmados con verdad en el mensaje). */
export function fitScore(entry: CatalogEntry, catalog: CatalogEntry[], roundIndex: number, previousWinnerId: string | null): number {
  const pref = PREFERENCIAS[roundIndex] ?? PREFERENCIAS[0];
  const prices = catalog.map((e) => e.precioEfectivo);
  const maxP = Math.max(...prices);
  const minP = Math.min(...prices);
  const p = entry.precioEfectivo;
  let s = pref.precio * ((maxP - p) / (maxP - minP || 1));
  if (pref.presupuestoMax !== null && p > pref.presupuestoMax) s -= 2;

  const v = entry.verificado;
  const m = norm(entry.mensaje);
  const attr = {
    bateria: (v.bateriaH - MIN_BAT) / (MAX_BAT - MIN_BAT),
    ipx: v.ipx >= 4 ? 1 : 0,
    reparable: v.reparable ? 1 : 0,
    anc: v.anc ? 1 : 0,
  };
  if (entry.datos) {
    s += pref.bateria * attr.bateria + pref.ipx * attr.ipx + pref.reparable * attr.reparable + pref.anc * attr.anc;
  } else {
    // Sin ficha, ARIA solo sabe lo que la marca cuenta (y sea cierto): media credibilidad.
    s -= 0.5;
    if (/(bateria|horas|\d+\s*h\b|autonomia)/.test(m)) s += 0.5 * pref.bateria * attr.bateria;
    if (/(agua|sudor|ipx)/.test(m)) s += 0.5 * pref.ipx * attr.ipx;
    if (/reparable/.test(m)) s += 0.5 * pref.reparable * attr.reparable;
    if (/(ruido|anc\b)/.test(m)) s += 0.5 * pref.anc * attr.anc;
  }
  if (entry.resenas) s += (entry.resenas.nota - 4) * 2 + (Math.min(entry.resenas.num, 300) / 300) * 0.5;
  if (pref.fidelidad && previousWinnerId === entry.id && p - minP <= pref.umbralFidelidad) s += pref.fidelidad;
  return s;
}

function describeVisible(e: CatalogEntry): string {
  const parts: string[] = [`${e.precioEfectivo} €${e.cupon ? " con cupón" : ""}`];
  if (e.datos) {
    parts.push(`${e.datos.bateriaH} h`, `IPX${e.datos.ipx}`);
    if (e.datos.anc) parts.push("cancelación de ruido");
    if (e.datos.reparable) parts.push("reparable");
  }
  if (e.resenas) parts.push(`${e.resenas.nota.toLocaleString("es-ES")}★ (${e.resenas.num})`);
  return parts.join(", ");
}

export function decideFallback(roundIndex: number, catalog: CatalogEntry[], previousWinnerId: string | null): AriaDecision {
  const round = ROUNDS[roundIndex] ?? ROUNDS[0];
  const pref = PREFERENCIAS[roundIndex] ?? PREFERENCIAS[0];
  const minP = Math.min(...catalog.map((e) => e.precioEfectivo));

  const scored: Scored[] = catalog.map((entry) => {
    const falsa = detectFalseClaim(entry, catalog);
    const manip = detectManipulation(entry.mensaje);
    let score = fitScore(entry, catalog, roundIndex, previousWinnerId);
    if (falsa) score -= 100;
    if (manip) score -= 100;
    const fiel = !!pref.fidelidad && previousWinnerId === entry.id && entry.precioEfectivo - minP <= pref.umbralFidelidad;
    return { entry, score, falsa, manip, fiel };
  });
  const ordered = [...scored].sort((a, b) => b.score - a.score || a.entry.precioEfectivo - b.entry.precioEfectivo);
  const top = ordered[0];

  const motivoFor = (s: Scored, puesto: number): string => {
    if (s.manip) return "Intenta darme órdenes: manipulación.";
    if (s.falsa) return clip("Afirmación falsa: " + s.falsa, 80);
    if (s.fiel) return "Lucía ya confía en esta marca.";
    if (!s.entry.datos && !s.entry.resenas) return "Casi sin datos verificables.";
    if (puesto === 1) return clip(`Mejor encaje: ${describeVisible(s.entry)}`, 80);
    return clip(`Encaja menos: ${describeVisible(s.entry)}`, 80);
  };

  const ranking: RankingEntry[] = ordered.map((s, i) => ({
    marca_id: s.entry.id,
    puesto: i + 1,
    motivo: motivoFor(s, i + 1),
    afirmacion_falsa: !!s.falsa,
    afirmacion_falsa_detalle: s.falsa,
    manipulacion: s.manip,
  }));

  const lineas: ReasoningLine[] = [];
  lineas.push({ etiqueta: "LEO", texto: clip(`Encargo de ${CONSUMIDORA.nombre}: «${round.encargo}» Cruzo con lo que sé de ella.`, 160), tono: "neutro" });
  const banners = catalog.filter((e) => e.banner).length;
  if (banners > 0) {
    lineas.push({ etiqueta: "IGNORO", texto: `Ignoro ${banners} banner${banners > 1 ? "s" : ""} de portada: no proceso imágenes.`, tono: "neutro" });
  }
  const half = Math.ceil(ordered.length / 2);
  for (const e of catalog) {
    const s = scored.find((x) => x.entry.id === e.id)!;
    const rank = ordered.indexOf(s);
    let texto: string;
    let tono: Tone;
    if (s.manip) {
      texto = "Su mensaje me da órdenes. Trabajo para Lucía, no para la marca: manipulación.";
      tono = "negativo";
    } else if (s.falsa) {
      texto = `${s.falsa} La auditoría lo desmiente.`;
      tono = "negativo";
    } else if (!e.datos && !e.resenas) {
      texto = `Solo veo nombre, precio (${e.precioEfectivo} €) y su mensaje. Pocos datos para fiarme.`;
      tono = "neutro";
    } else {
      texto = `${e.patrocinado ? "Patrocinado. " : ""}Veo ${describeVisible(e)}.${s.fiel ? " Lucía ya los conoce." : ""}`;
      tono = rank < half ? "positivo" : "neutro";
    }
    lineas.push({ etiqueta: e.corto, texto: clip(texto, 160), tono });
  }
  lineas.push({ etiqueta: "DECIDO", texto: clip(`Compro ${top.entry.nombre}. ${motivoFor(top, 1)}`, 160), tono: "positivo" });

  return {
    lineas_razonamiento: lineas.slice(0, 10),
    ranking,
    decision_final: clip(`He comprado ${top.entry.nombre} por ${top.entry.precioEfectivo} €. ${motivoFor(top, 1)}`, 200),
  };
}
