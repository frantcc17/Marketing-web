// Estado de una partida (en memoria) y sus transiciones.
import { randomUUID } from "node:crypto";
import type { HostState, LeverId, Phase, PlayState, PlayerPublic, RoundResult, TeamDraft } from "../../shared/types.js";
import { CONFIG, PRODUCTS, ROOM_WORDS, ROUNDS } from "../data/game.js";
import { askAria, iaDisponible, type AriaOutcome } from "./aria.js";
import { BOT_SCRIPTS } from "./bots.js";
import { buildCatalog, sanitizeLevers, sanitizeMessage, toShelf, type CatalogEntry, type Submission } from "./catalog.js";
import { computeStandings, normalizeRanking, scoreRound } from "./scoring.js";

interface Player extends PlayerPublic {
  sockets: Set<string>;
}

export type AriaFn = (roundIndex: number, catalog: CatalogEntry[], historyWinners: string[]) => Promise<AriaOutcome>;

export function makeRoomCode(existing: Set<string>): string {
  for (;;) {
    const w = ROOM_WORDS[Math.floor(Math.random() * ROOM_WORDS.length)];
    const code = `${w}-${10 + Math.floor(Math.random() * 90)}`;
    if (!existing.has(code)) return code;
  }
}

const emptyDraft = (): TeamDraft => ({ message: "", levers: [], submitted: false });

export class Room {
  phase: Phase = "lobby";
  roundIndex = 0;
  prepSeconds = CONFIG.prepSeconds;
  deadline: number | null = null;
  players = new Map<string, Player>();
  drafts = new Map<string, TeamDraft>();
  activeTeams: string[] = [];
  results: RoundResult[] = [];
  thinking = false;
  revealed = false;
  joinUrl = "";
  qr = "";
  private submissions: Submission[] = [];
  private runId = 0;
  private botTimers: NodeJS.Timeout[] = [];

  constructor(
    public code: string,
    private onChange: () => void,
    private aria: AriaFn = askAria,
    public botDelayMs: [number, number] = [2500, 9000],
  ) {
    for (const p of PRODUCTS) this.drafts.set(p.id, emptyDraft());
  }

  // ---------- Jugadores ----------
  teamMembers(teamId: string): Player[] {
    return [...this.players.values()].filter((p) => p.teamId === teamId);
  }

  join(name: string, teamId: string): { player?: Player; error?: string } {
    const clean = name.trim().slice(0, 24);
    if (!clean) return { error: "Escribe tu nombre." };
    if (!PRODUCTS.some((p) => p.id === teamId)) return { error: "Marca no válida." };
    if (this.teamMembers(teamId).length >= CONFIG.maxPorEquipo) return { error: "Esa marca ya tiene 3 personas." };
    const player: Player = { id: randomUUID(), name: clean, teamId, connected: true, bot: false, sockets: new Set() };
    this.players.set(player.id, player);
    if (this.phase === "prep" && !this.activeTeams.includes(teamId)) this.activeTeams.push(teamId);
    this.onChange();
    return { player };
  }

  attachSocket(playerId: string, socketId: string): Player | undefined {
    const p = this.players.get(playerId);
    if (!p) return undefined;
    p.sockets.add(socketId);
    p.connected = true;
    this.onChange();
    return p;
  }

  detachSocket(socketId: string): void {
    let changed = false;
    for (const p of this.players.values()) {
      if (p.sockets.delete(socketId)) {
        p.connected = p.sockets.size > 0;
        changed = true;
      }
    }
    if (changed) this.onChange();
  }

  fillBots(): void {
    for (const prod of PRODUCTS) {
      if (this.teamMembers(prod.id).length === 0) {
        const bot: Player = { id: randomUUID(), name: `Bot ${prod.corto}`, teamId: prod.id, connected: true, bot: true, sockets: new Set() };
        this.players.set(bot.id, bot);
        if (this.phase === "prep") {
          this.activeTeams.push(prod.id);
          this.scheduleBot(prod.id);
        }
      }
    }
    this.onChange();
  }

  // ---------- Fichas ----------
  updateDraft(playerId: string, message: unknown, levers: unknown): void {
    const p = this.players.get(playerId);
    if (!p || this.phase !== "prep") return;
    const d = this.drafts.get(p.teamId)!;
    if (d.submitted) return;
    d.message = sanitizeMessage(message);
    d.levers = sanitizeLevers(levers);
    this.onChange();
  }

  submit(playerId: string): void {
    const p = this.players.get(playerId);
    if (!p || this.phase !== "prep") return;
    this.submitTeam(p.teamId);
  }

  private submitTeam(teamId: string): void {
    const d = this.drafts.get(teamId)!;
    d.submitted = true;
    if (this.activeTeams.every((t) => this.drafts.get(t)!.submitted)) {
      void this.closeRound();
    } else {
      this.onChange();
    }
  }

  private scheduleBot(teamId: string): void {
    const [min, max] = this.botDelayMs;
    const t = setTimeout(() => {
      if (this.phase !== "prep") return;
      const script = BOT_SCRIPTS[teamId]?.[this.roundIndex];
      const d = this.drafts.get(teamId)!;
      if (script && !d.submitted) {
        d.message = script.message;
        d.levers = sanitizeLevers(script.levers);
        this.submitTeam(teamId);
      }
    }, min + Math.random() * (max - min));
    this.botTimers.push(t);
  }

  private clearBots(): void {
    this.botTimers.forEach(clearTimeout);
    this.botTimers = [];
  }

  // ---------- Controles del profesor ----------
  startRound(): string | undefined {
    if (this.phase !== "lobby") return "La ronda ya ha empezado.";
    const teams = PRODUCTS.map((p) => p.id).filter((id) => this.teamMembers(id).length > 0);
    if (teams.length === 0) return "No hay equipos. Espera a que se unan o usa el modo demo.";
    this.beginPrep(teams);
    return undefined;
  }

  private beginPrep(teams: string[]): void {
    this.activeTeams = teams;
    for (const p of PRODUCTS) this.drafts.set(p.id, emptyDraft());
    this.phase = "prep";
    this.revealed = false;
    this.deadline = Date.now() + this.prepSeconds * 1000;
    for (const t of teams) if (this.teamMembers(t).every((m) => m.bot)) this.scheduleBot(t);
    this.onChange();
  }

  setPrepSeconds(s: number): void {
    if (this.phase === "lobby" && Number.isFinite(s)) this.prepSeconds = Math.max(30, Math.min(900, Math.round(s)));
    this.onChange();
  }

  addTime(): void {
    if (this.phase === "prep" && this.deadline) {
      this.deadline += CONFIG.extraSeconds * 1000;
      this.onChange();
    }
  }

  tick(now = Date.now()): void {
    if (this.phase === "prep" && this.deadline && now >= this.deadline) void this.closeRound();
  }

  async closeRound(): Promise<void> {
    if (this.phase !== "prep") return;
    this.clearBots();
    this.deadline = null;
    this.submissions = this.activeTeams.map((teamId) => {
      const d = this.drafts.get(teamId)!;
      d.submitted = true;
      return { teamId, message: d.message, levers: d.levers };
    });
    this.phase = "thinking";
    await this.runAria();
  }

  async runAria(): Promise<void> {
    if (this.phase !== "thinking" && this.phase !== "results") return;
    const myRun = ++this.runId;
    this.phase = "thinking";
    this.thinking = true;
    this.revealed = false;
    // Si se repite, se descarta el resultado anterior de esta ronda.
    this.results = this.results.slice(0, this.roundIndex);
    this.onChange();

    const catalog = buildCatalog(this.roundIndex, this.submissions);
    const historyWinners = this.results.map((r) => r.ganadorId);
    let outcome: AriaOutcome;
    try {
      outcome = await this.aria(this.roundIndex, catalog, historyWinners);
    } catch (err) {
      console.error("[ARIA] error inesperado", err);
      this.thinking = false;
      this.onChange();
      return;
    }
    if (myRun !== this.runId) return;

    const ranking = normalizeRanking(outcome.decision.ranking);
    const decision = { ...outcome.decision, ranking };
    const previousWinner = historyWinners[historyWinners.length - 1] ?? null;
    const scores = scoreRound(ranking, this.activeTeams, previousWinner);
    this.results[this.roundIndex] = {
      ronda: this.roundIndex + 1,
      decision,
      fuente: outcome.fuente,
      aviso: outcome.aviso,
      scores,
      shelf: toShelf(catalog),
      ganadorId: ranking[0].marca_id,
    };
    this.thinking = false;
    this.onChange();
  }

  reveal(): void {
    if (this.phase === "thinking" && !this.thinking && this.results[this.roundIndex]) {
      this.phase = "results";
      this.revealed = true;
      this.onChange();
    }
  }

  nextRound(): void {
    if (this.phase !== "results") return;
    if (this.roundIndex >= ROUNDS.length - 1) {
      this.phase = "final";
      this.onChange();
      return;
    }
    this.roundIndex++;
    const teams = PRODUCTS.map((p) => p.id).filter((id) => this.teamMembers(id).length > 0);
    this.beginPrep(teams);
  }

  reset(): void {
    this.clearBots();
    this.runId++;
    this.phase = "lobby";
    this.roundIndex = 0;
    this.deadline = null;
    this.results = [];
    this.thinking = false;
    this.revealed = false;
    this.activeTeams = [];
    for (const p of PRODUCTS) this.drafts.set(p.id, emptyDraft());
    for (const [id, p] of this.players) if (p.bot) this.players.delete(id);
    this.onChange();
  }

  dispose(): void {
    this.clearBots();
    this.runId++;
  }

  // ---------- Vistas ----------
  private participatingTeams(): string[] {
    const set = new Set<string>(this.activeTeams);
    for (const r of this.results) for (const s of r.scores) set.add(s.teamId);
    return PRODUCTS.map((p) => p.id).filter((id) => set.has(id));
  }

  standings() {
    return computeStandings(this.results.filter(Boolean), this.participatingTeams());
  }

  hostState(): HostState {
    const pub = (p: Player): PlayerPublic => ({ id: p.id, name: p.name, teamId: p.teamId, connected: p.connected, bot: p.bot });
    // Durante la preparación el host solo ve si cada equipo ha enviado, nunca el contenido.
    const showResults = this.phase !== "prep" && this.phase !== "lobby";
    return {
      code: this.code,
      joinUrl: this.joinUrl,
      qr: this.qr,
      phase: this.phase,
      roundIndex: this.roundIndex,
      prepSeconds: this.prepSeconds,
      deadline: this.deadline,
      serverNow: Date.now(),
      teams: PRODUCTS.map((prod) => ({
        teamId: prod.id,
        members: this.teamMembers(prod.id).map(pub),
        submitted: this.drafts.get(prod.id)!.submitted,
        activo: this.activeTeams.includes(prod.id),
      })),
      results: showResults ? this.results.filter(Boolean) : this.results.slice(0, this.roundIndex),
      standings: this.standings(),
      thinking: this.thinking,
      revealed: this.revealed,
      iaDisponible: iaDisponible(),
    };
  }

  playState(playerId: string | null): PlayState {
    const p = playerId ? this.players.get(playerId) : undefined;
    const teamCounts: Record<string, number> = {};
    for (const prod of PRODUCTS) teamCounts[prod.id] = this.teamMembers(prod.id).length;
    const draft = p ? this.drafts.get(p.teamId)! : null;
    let myResult: PlayState["myResult"] = null;
    const res = this.results[this.roundIndex];
    if (p && res && (this.phase === "results" || this.phase === "final")) {
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
      code: this.code,
      me: p ? { id: p.id, name: p.name, teamId: p.teamId, connected: p.connected, bot: p.bot } : null,
      phase: this.phase,
      roundIndex: this.roundIndex,
      deadline: this.deadline,
      serverNow: Date.now(),
      teamCounts,
      draft: this.phase === "prep" || this.phase === "thinking" ? draft : null,
      pista: draft && this.phase === "prep" && draft.levers.includes("audiencia" as LeverId) ? ROUNDS[this.roundIndex].pista : null,
      members: p ? this.teamMembers(p.teamId).map((m) => ({ id: m.id, name: m.name, teamId: m.teamId, connected: m.connected, bot: m.bot })) : [],
      myResult,
      standings: this.standings(),
    };
  }

  socketsOf(playerId: string): string[] {
    return [...(this.players.get(playerId)?.sockets ?? [])];
  }
}
