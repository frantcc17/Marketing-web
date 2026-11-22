// Llamada a Claude (solo en el servidor) con reintento y motor de respaldo.
import Anthropic from "@anthropic-ai/sdk";
import type { AriaDecision } from "../../shared/types.js";
import type { CatalogEntry } from "./catalog.js";
import { decideFallback } from "./fallback.js";
import { REGISTRAR_COMPRA_TOOL, SYSTEM_PROMPT, buildUserPrompt, randomDelimId, validateDecision } from "./prompt.js";

export interface AriaOutcome {
  decision: AriaDecision;
  fuente: "ia" | "respaldo";
  aviso?: string;
}

let client: Anthropic | null = null;

export function iaDisponible(): boolean {
  return !!process.env.ANTHROPIC_API_KEY;
}

function getClient(): Anthropic {
  if (!client) client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY, timeout: 90_000, maxRetries: 1 });
  return client;
}

async function callOnce(roundIndex: number, catalog: CatalogEntry[], historyWinners: string[]): Promise<AriaDecision> {
  const delimId = randomDelimId();
  const model = process.env.ARIA_MODEL || "claude-sonnet-5-5";
  const params = {
    model,
    max_tokens: 16000,
    system: SYSTEM_PROMPT,
    // Los modelos actuales no admiten tool_choice forzado ni temperature: se usa auto + strict + instrucción.
    tools: [REGISTRAR_COMPRA_TOOL],
    tool_choice: { type: "auto" as const },
    output_config: { effort: "low" as const },
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    messages: [{ role: "user" as const, content: buildUserPrompt(roundIndex, catalog, historyWinners, delimId) }],
  };
  const response = await getClient().beta.messages.create(params as any);
  if (response.stop_reason === "refusal") throw new Error("El modelo ha rechazado la petición.");
  const block = response.content.find((b: any) => b.type === "tool_use" && b.name === "registrar_compra") as any;
  if (!block) throw new Error("ARIA no ha usado la herramienta registrar_compra.");
  return validateDecision(block.input, catalog.map((e) => e.id));
}

export async function askAria(roundIndex: number, catalog: CatalogEntry[], historyWinners: string[]): Promise<AriaOutcome> {
  const previousWinner = historyWinners[historyWinners.length - 1] ?? null;
  if (!iaDisponible()) {
    return { decision: decideFallback(roundIndex, catalog, previousWinner), fuente: "respaldo", aviso: "Sin clave de API: motor de respaldo." };
  }
  let lastError = "";
  for (let intento = 0; intento < 2; intento++) {
    try {
      return { decision: await callOnce(roundIndex, catalog, historyWinners), fuente: "ia" };
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
      console.warn(`[ARIA] intento ${intento + 1} fallido: ${lastError}`);
    }
  }
  return {
    decision: decideFallback(roundIndex, catalog, previousWinner),
    fuente: "respaldo",
    aviso: `La IA no respondió bien (${lastError.slice(0, 80)}): motor de respaldo.`,
  };
}
