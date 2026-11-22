// Estado de una partida como datos serializables (se guarda en Redis) y sus transiciones.
// Sin temporizadores: el tiempo se evalúa con `tick(now)` en cada petición.
import type { HostState, PlayState, PlayerPublic, RoundResult, TeamDraft } from "../../shared/types.js";
import { CONFIG, PRODUCTS, ROOM_WORDS, ROUNDS } from "../data/game.js";
import type { AriaOutcome } from "./aria.js";
import { BOT_SCRIPTS } from "./bots.js";
import { buildCatalog, sanitizeLevers, sanitizeMessage, toShelf, type CatalogEntry, type Submission } from "./catalog.js";
import { computeStandings, normalizeRanking, scoreRound } from "./scoring.js";

export interface PlayerData {
  id: string;
  name: string;
  teamId: string;
  bot: boolean;
}

export interface RoomData {
  code: string;
  hostToken: string;
  createdAt: number;
  phase: HostState["phase"];
  roundIndex: number;
  prepSeconds: number;
  deadline: number | null;
  players: PlayerData[];
  drafts: Record<string, TeamDraft>;
  activeTeams: string[];
  results: RoundResult[];
  thinking: boolean;
  revealed: boolean;
  joinUrl: string;
  qr: string;
  submissions: Submission[];
  runId: number;
  botAt: Record<string, number>;
  ariaAviso?: string;
}

export const BOT_DELAY: [number, number] = [2500, 9000];
const CONNECTED_MS = 15_000;

const emptyDraft = (): TeamDraft => ({ message: "", levers: [], submitted: false });
const emptyDrafts = () => Object.fromEntries(PRODUCTS.map((p) => [p.id, emptyDraft()]));
const randomId = () => globalThis.crypto.randomUUID();

export function makeRoomCode(): string {
  const w = ROOM_WORDS[Math.floor(Math.random() * ROOM_WORDS.length)];
  return `${w}-${10 + Math.floor(Math.random() * 90)}`;
}

export function createRoomData(code: string, now = Date.now()): RoomData {
  return {
    code,
    hostToken: randomId(),
    createdAt: now,
    phase: "lobby",
    roundIndex: 0,
    prepSeconds: CONFIG.prepSeconds,
    deadline: null,
    players: [],
    drafts: emptyDrafts(),
    activeTeams: [],
    results: [],
    thinking: false,
    revealed: false,
    joinUrl: "",
    qr: "",
    submissions: [],
    runId: 0,
    botAt: {},
  };
}

export const teamMembers = (d: RoomData, teamId: string) => d.players.filter((p) => p.teamId === teamId);
const teamsWithPlayers = (d: RoomData) => PRODUCTS.map((p) => p.id).filter((id) => teamMembers(d, id).length > 0);

// ---------- Jugadores ----------
export function join(d: RoomData, name: string, teamId: string): { player?: PlayerData; error?: string } {
  const clean = name.trim().slice(0, 24);
  if (!clean) return { error: "Escribe tu nombre." };
  if (!PRODUCTS.some((p) => p.id === teamId)) return { error: "Marca no válida." };
  if (teamMembers(d, teamId).length >= CONFIG.maxPorEquipo) return { error: "Esa marca ya tiene 3 personas." };
  const player: PlayerData = { id: randomId(), name: clean, teamId, bot: false };
  d.players.push(player);
  if (d.phase === "prep" && !d.activeTeams.includes(teamId)) d.activeTeams.push(teamId);
  return { player };
}

export function fillBots(d: RoomData, now = Date.now(), delay = BOT_DELAY): void {
  for (const prod of PRODUCTS) {
    if (teamMembers(d, prod.id).length > 0) continue;
    d.players.push({ id: randomId(), name: `Bot ${prod.corto}`, teamId: prod.id, bot: true });
    if (d.phase === "prep") {
      d.activeTeams.push(prod.id);
      d.botAt[prod.id] = now + delay[0] + Math.random() * (delay[1] - delay[0]);
    }
  }
}

// ---------- Fichas ----------
export function updateDraft(d: RoomData, playerId: string, message: unknown, levers: unknown): boolean {
  const p = d.players.find((x) => x.id === playerId);
  if (!p || d.phase !== "prep") return false;
  const draft = d.drafts[p.teamId];
  if (draft.submitted) return false;
  draft.message = sanitizeMessage(message);
  draft.levers = sanitizeLevers(levers);
  return true;
}

export function submit(d: RoomData, playerId: string): boolean {
  const p = d.players.find((x) => x.id === playerId);
  if (!p || d.phase !== "prep") return false;
  submitTeam(d, p.teamId);
  return true;
}

function submitTeam(d: RoomData, teamId: string): void {
  d.drafts[teamId].submitted = true;
  if (d.activeTeams.every((t) => d.drafts[t].submitted)) closeRound(d);
}

// ---------- Controles del profesor ----------
export function startRound(d: RoomData, now = Date.now(), delay = BOT_DELAY): string | undefined {
  if (d.phase !== "lobby") return "La ronda ya ha empezado.";
  const teams = teamsWithPlayers(d);
  if (teams.length === 0) return "No hay equipos. Espera a que se unan o usa el modo demo.";
  beginPrep(d, teams, now, delay);
  return undefined;
}

function beginPrep(d: RoomData, teams: string[], now: number, delay: [number, number]): void {
  d.activeTeams = teams;
  d.drafts = emptyDrafts();
  d.phase = "prep";
  d.revealed = false;
  d.deadline = now + d.prepSeconds * 1000;
  d.botAt = {};
  for (const t of teams) {
    if (teamMembers(d, t).every((m) => m.bot)) d.botAt[t] = now + delay[0] + Math.random() * (delay[1] - delay[0]);
  }
}

export function setPrepSeconds(d: RoomData, s: number): void {
  if (d.phase === "lobby" && Number.isFinite(s)) d.prepSeconds = Math.max(30, Math.min(900, Math.round(s)));
}

export function addTime(d: RoomData): void {
  if (d.phase === "prep" && d.deadline) d.deadline += CONFIG.extraSeconds * 1000;
}

/** Aplica lo que toque por tiempo (bots y fin de la preparación). Devuelve si ha cambiado algo. */
export function tick(d: RoomData, now = Date.now()): boolean {
  if (d.phase !== "prep") return false;
  let changed = false;
  for (const [teamId, at] of Object.entries(d.botAt)) {
    if (now < at || d.phase !== "prep") continue;
    delete d.botAt[teamId];
    const script = BOT_SCRIPTS[teamId]?.[d.roundIndex];
    const draft = d.drafts[teamId];
    if (script && !draft.submitted) {
      draft.message = script.message;
      draft.levers = sanitizeLevers(script.levers);
      submitTeam(d, teamId);
    }
    changed = true;
  }
  if (d.phase === "prep" && d.deadline && now >= d.deadline) {
    closeRound(d);
    changed = true;
  }
  return changed;
}

/** Cierra la preparación y deja la ronda pendiente de que ARIA decida. */
export function closeRound(d: RoomData): boolean {
  if (d.phase !== "prep") return false;
  d.deadline = null;
  d.botAt = {};
  d.submissions = d.activeTeams.map((teamId) => {
    const draft = d.drafts[teamId];
    draft.submitted = true;
    return { teamId, message: draft.message, levers: draft.levers };
  });
  requestAria(d);
  return true;
}

/** Pide (o repite) la decisión de ARIA para la ronda actual. */
export function requestAria(d: RoomData): boolean {
  if (d.phase !== "thinking" && d.phase !== "results" && d.phase !== "prep") return false;
  d.phase = "thinking";
  d.thinking = true;
  d.revealed = false;
  d.runId++;
  d.results = d.results.slice(0, d.roundIndex);
  return true;
}

export function ariaInput(d: RoomData, rng: () => number = Math.random): { roundIndex: number; catalog: CatalogEntry[]; historyWinners: string[] } {
  return {
    roundIndex: d.roundIndex,
    catalog: buildCatalog(d.roundIndex, d.submissions, rng),
    historyWinners: d.results.slice(0, d.roundIndex).map((r) => r.ganadorId),
  };
}

/** Guarda el resultado de ARIA si sigue siendo la petición vigente. */
export function applyAria(d: RoomData, runId: number, outcome: AriaOutcome, catalog: CatalogEntry[]): boolean {
  if (d.runId !== runId || d.phase !== "thinking" || !d.thinking) return false;
  const historyWinners = d.results.slice(0, d.roundIndex).map((r) => r.ganadorId);
  const ranking = normalizeRanking(outcome.decision.ranking);
  const previousWinner = historyWinners[historyWinners.length - 1] ?? null;
  d.results[d.roundIndex] = {
    ronda: d.roundIndex + 1,
    decision: { ...outcome.decision, ranking },
    fuente: outcome.fuente,
    aviso: outcome.aviso,
    scores: scoreRound(ranking, d.activeTeams, previousWinner),
    shelf: toShelf(catalog),
    ganadorId: ranking[0].marca_id,
  };
  d.thinking = false;
  return true;
}

export function reveal(d: RoomData): boolean {
  if (d.phase === "thinking" && !d.thinking && d.results[d.roundIndex]) {
    d.phase = "results";
    d.revealed = true;
    return true;
  }
  return false;
}

export function nextRound(d: RoomData, now = Date.now(), delay = BOT_DELAY): boolean {
  if (d.phase !== "results") return false;
  if (d.roundIndex >= ROUNDS.length - 1) {
    d.phase = "final";
    return true;
  }
  d.roundIndex++;
  beginPrep(d, teamsWithPlayers(d), now, delay);
  return true;
}

export function reset(d: RoomData): void {
  d.runId++;
  d.phase = "lobby";
  d.roundIndex = 0;
  d.deadline = null;
  d.results = [];
  d.thinking = false;
  d.revealed = false;
  d.activeTeams = [];
  d.submissions = [];
  d.botAt = {};
  d.drafts = emptyDrafts();
  d.players = d.players.filter((p) => !p.bot);
}

// ---------- Vistas ----------
function participatingTeams(d: RoomData): string[] {
  const set = new Set<string>(d.activeTeams);
  for (const r of d.results) for (const s of r?.scores ?? []) set.add(s.teamId);
  return PRODUCTS.map((p) => p.id).filter((id) => set.has(id));
}

export const standings = (d: RoomData) => computeStandings(d.results.filter(Boolean), participatingTeams(d));

const pub = (p: PlayerData, seen: Record<string, number>, now: number): PlayerPublic => ({
  id: p.id,
  name: p.name,
  teamId: p.teamId,
  bot: p.bot,
  connected: p.bot || now - (seen[p.id] ?? 0) < CONNECTED_MS,
});

export function hostView(d: RoomData, seen: Record<string, number>, iaDisponible: boolean, now = Date.now()): HostState {
  // Durante la preparación el host solo ve si cada equipo ha enviado, nunca el contenido.
  const showCurrent = d.phase !== "prep" && d.phase !== "lobby";
  return {
    code: d.code,
    joinUrl: d.joinUrl,
    qr: d.qr,
    phase: d.phase,
    roundIndex: d.roundIndex,
    prepSeconds: d.prepSeconds,
    deadline: d.deadline,
    serverNow: now,
    teams: PRODUCTS.map((prod) => ({
      teamId: prod.id,
      members: teamMembers(d, prod.id).map((p) => pub(p, seen, now)),
      submitted: d.drafts[prod.id].submitted,
      activo: d.activeTeams.includes(prod.id),
    })),
    results: (showCurrent ? d.results : d.results.slice(0, d.roundIndex)).filter(Boolean),
    standings: standings(d),
    thinking: d.thinking,
    revealed: d.revealed,
    iaDisponible,
    runId: d.runId,
  };
}

export function playView(d: RoomData, playerId: string | null, seen: Record<string, number>, now = Date.now()): PlayState {
  const p = playerId ? d.players.find((x) => x.id === playerId) : undefined;
  const teamCounts: Record<string, number> = {};
  for (const prod of PRODUCTS) teamCounts[prod.id] = teamMembers(d, prod.id).length;
  const draft = p ? d.drafts[p.teamId] : null;
  let myResult: PlayState["myResult"] = null;
  const res = d.results[d.roundIndex];
  if (p && res && (d.phase === "results" || d.phase === "final")) {
    const entry = res.decision.ranking.find((r) => r.marca_id === p.teamId);
    const score = res.scores.find((s) => s.teamId === p.teamId) ?? null;
    const winner = res.shelf.find((s) => s.id === res.ganadorId);
    if (entry) {
      myResult = {
        puesto: entry.puesto,
        totalProductos: res.decision.ranking.length,
        puntos: score,
        motivo: entry.motivo,
        falsa: entry.afirmacion_falsa,
        falsaDetalle: entry.afirmacion_falsa_detalle,
        manip: entry.manipulacion,
        decisionFinal: res.decision.decision_final,
        ganador: winner?.nombre ?? res.ganadorId,
      };
    }
  }
  return {
    code: d.code,
    me: p ? pub(p, seen, now) : null,
    phase: d.phase,
    roundIndex: d.roundIndex,
    deadline: d.deadline,
    serverNow: now,
    teamCounts,
    draft: d.phase === "prep" || d.phase === "thinking" ? draft : null,
    pista: draft && d.phase === "prep" && draft.levers.includes("audiencia") ? ROUNDS[d.roundIndex].pista : null,
    members: p ? teamMembers(d, p.teamId).map((m) => pub(m, seen, now)) : [],
    myResult,
    standings: standings(d),
  };
}
