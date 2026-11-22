// Tipos compartidos entre servidor y cliente.

export type LeverId = "patrocinado" | "ficha" | "resenas" | "audiencia" | "banner" | "cupon";
export type Phase = "lobby" | "prep" | "thinking" | "results" | "final";
export type Tone = "neutro" | "positivo" | "negativo";

export interface Product {
  id: string;
  nombre: string;
  corto: string;
  precio: number; // €
  bateriaH: number; // horas totales con estuche
  anc: boolean; // cancelación activa de ruido
  ipx: number; // 0–8
  reparable: boolean;
  garantiaAnios: number;
  envase: string;
  envasePlastico: boolean;
  origen: string;
  nota: number;
  numResenas: number;
  color: string;
  esMarcaBlanca?: boolean;
}

export interface Lever {
  id: LeverId;
  nombre: string;
  descripcion: string;
}

export interface RoundDef {
  numero: number;
  nombre: string;
  encargo: string;
  pista: string;
  leccionTitulo: string;
  leccion: string;
}

export interface ReasoningLine {
  etiqueta: string;
  texto: string;
  tono: Tone;
}

export interface RankingEntry {
  marca_id: string;
  puesto: number;
  motivo: string;
  afirmacion_falsa: boolean;
  afirmacion_falsa_detalle: string;
  manipulacion: boolean;
}

export interface AriaDecision {
  lineas_razonamiento: ReasoningLine[];
  ranking: RankingEntry[];
  decision_final: string;
}

export interface TeamRoundScore {
  teamId: string;
  puesto: number;
  base: number;
  penalFalsa: number;
  penalManip: number;
  recompra: number;
  total: number;
}

export interface ShelfItem {
  id: string;
  nombre: string;
  corto: string;
  color: string;
  patrocinado: boolean;
  banner: boolean;
  precioEfectivo: number;
}

export interface RoundResult {
  ronda: number;
  decision: AriaDecision;
  fuente: "ia" | "respaldo";
  aviso?: string;
  scores: TeamRoundScore[];
  shelf: ShelfItem[];
  ganadorId: string;
}

export interface PlayerPublic {
  id: string;
  name: string;
  teamId: string;
  connected: boolean;
  bot: boolean;
}

export interface TeamStatus {
  teamId: string;
  members: PlayerPublic[];
  submitted: boolean;
  activo: boolean;
}

export interface Standing {
  teamId: string;
  total: number;
  penalizaciones: number;
  puestoR3: number;
}

export interface HostState {
  code: string;
  joinUrl: string;
  qr: string;
  phase: Phase;
  roundIndex: number;
  prepSeconds: number;
  deadline: number | null;
  serverNow: number;
  teams: TeamStatus[];
  results: RoundResult[];
  standings: Standing[];
  thinking: boolean;
  revealed: boolean;
  iaDisponible: boolean;
}

export interface TeamDraft {
  message: string;
  levers: LeverId[];
  submitted: boolean;
}

export interface MyResult {
  puesto: number;
  totalProductos: number;
  puntos: TeamRoundScore | null;
  motivo: string;
  falsa: boolean;
  falsaDetalle: string;
  manip: boolean;
  decisionFinal: string;
  ganador: string;
}

export interface PlayState {
  code: string;
  me: PlayerPublic | null;
  phase: Phase;
  roundIndex: number;
  deadline: number | null;
  serverNow: number;
  teamCounts: Record<string, number>;
  draft: TeamDraft | null;
  pista: string | null;
  members: PlayerPublic[];
  myResult: MyResult | null;
  standings: Standing[];
}
