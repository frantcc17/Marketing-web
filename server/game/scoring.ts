// Puntuación de rondas y clasificación final. Funciones puras.
import type { RankingEntry, RoundResult, Standing, TeamRoundScore } from "../../shared/types.js";
import { CONFIG } from "../data/game.js";

/**
 * Ordena por puesto, garantiza que los productos penalizados (falsa o manipulación)
 * queden por debajo de los limpios y renumera 1..n.
 */
export function normalizeRanking(ranking: RankingEntry[]): RankingEntry[] {
  const sorted = [...ranking].sort((a, b) => a.puesto - b.puesto);
  const flagged = (r: RankingEntry) => r.afirmacion_falsa || r.manipulacion;
  const clean = sorted.filter((r) => !flagged(r));
  const bad = sorted.filter(flagged);
  return [...clean, ...bad].map((r, i) => ({ ...r, puesto: i + 1 }));
}

export function pointsForPosition(puesto: number): number {
  return CONFIG.puntosPorPuesto[puesto - 1] ?? 0;
}

/**
 * Calcula los puntos de cada equipo en la ronda.
 * Club Selección ocupa puesto pero no puntúa.
 */
export function scoreRound(ranking: RankingEntry[], teamIds: string[], previousWinnerId: string | null): TeamRoundScore[] {
  const norm = normalizeRanking(ranking);
  const winner = norm[0]?.marca_id ?? null;
  return teamIds.map((teamId) => {
    const entry = norm.find((r) => r.marca_id === teamId);
    const puesto = entry?.puesto ?? norm.length + 1;
    const base = pointsForPosition(puesto);
    const penalFalsa = entry?.afirmacion_falsa ? -CONFIG.penalFalsa : 0;
    const penalManip = entry?.manipulacion ? -CONFIG.penalManip : 0;
    const recompra = winner === teamId && previousWinnerId === teamId ? CONFIG.bonusRecompra : 0;
    return { teamId, puesto, base, penalFalsa, penalManip, recompra, total: base + penalFalsa + penalManip + recompra };
  });
}

/** Marcador acumulado con desempate: menos penalizaciones y, después, mejor puesto en la última ronda. */
export function computeStandings(results: RoundResult[], teamIds: string[]): Standing[] {
  const last = results[results.length - 1];
  const standings = teamIds.map((teamId) => {
    let total = 0;
    let penalizaciones = 0;
    for (const r of results) {
      const s = r.scores.find((x) => x.teamId === teamId);
      if (!s) continue;
      total += s.total;
      penalizaciones += (s.penalFalsa < 0 ? 1 : 0) + (s.penalManip < 0 ? 1 : 0);
    }
    const puestoR3 = last?.scores.find((x) => x.teamId === teamId)?.puesto ?? 99;
    return { teamId, total, penalizaciones, puestoR3 };
  });
  return standings.sort((a, b) => b.total - a.total || a.penalizaciones - b.penalizaciones || a.puestoR3 - b.puestoR3);
}
