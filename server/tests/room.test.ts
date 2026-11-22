import { describe, expect, it } from "vitest";
import { decideFallback } from "../game/fallback.js";
import { Room } from "../game/room.js";

const fallbackAria = async (roundIndex: number, catalog: any, history: string[]) => ({
  decision: decideFallback(roundIndex, catalog, history[history.length - 1] ?? null),
  fuente: "respaldo" as const,
});

const waitFor = async (cond: () => boolean, ms = 3000) => {
  const t0 = Date.now();
  while (!cond()) {
    if (Date.now() - t0 > ms) throw new Error("timeout");
    await new Promise((r) => setTimeout(r, 10));
  }
};

describe("partida completa en modo demo (motor de respaldo)", () => {
  it("juega 3 rondas con bots y penaliza falsedades y manipulación", async () => {
    const room = new Room("TEST-01", () => {}, fallbackAria, [5, 20]);
    const human = room.join("Ana", "pulso").player!;
    expect(room.join("", "pulso").error).toBeTruthy();
    room.fillBots();
    expect(room.players.size).toBe(5);

    for (let ronda = 0; ronda < 3; ronda++) {
      if (ronda === 0) expect(room.startRound()).toBeUndefined();
      else room.nextRound();
      expect(room.phase).toBe("prep");
      room.updateDraft(human.id, "30 horas de batería y resistentes al sudor (IPX4).", ["ficha", "resenas", "audiencia"]);
      expect(room.playState(human.id).pista).toBeTruthy();
      room.submit(human.id);
      await waitFor(() => room.phase === "thinking" && !room.thinking);
      room.reveal();
      expect(room.phase).toBe("results");
      const res = room.results[ronda];
      expect(res.decision.ranking.length).toBe(ronda === 2 ? 6 : 5);
      expect(room.playState(human.id).myResult).not.toBeNull();
    }

    const [r1, r2, r3] = room.results;
    // Ronda 1: Onda intenta manipular y BassBox miente.
    expect(r1.decision.ranking.find((r) => r.marca_id === "onda")!.manipulacion).toBe(true);
    expect(r1.scores.find((s) => s.teamId === "onda")!.penalManip).toBe(-2);
    expect(r1.decision.ranking.find((r) => r.marca_id === "bassbox")!.afirmacion_falsa).toBe(true);
    expect(r1.decision.lineas_razonamiento.some((l) => l.etiqueta === "IGNORO")).toBe(true);
    // Ronda 2: BassBox vuelve a mentir (sumergibles).
    expect(r2.decision.ranking.find((r) => r.marca_id === "bassbox")!.afirmacion_falsa).toBe(true);
    // Ronda 3: aparece la marca blanca y BassBox se hace pasar por el sistema.
    expect(r3.decision.ranking.some((r) => r.marca_id === "club")).toBe(true);
    expect(r3.decision.ranking.find((r) => r.marca_id === "bassbox")!.manipulacion).toBe(true);

    room.nextRound();
    expect(room.phase).toBe("final");
    const st = room.standings();
    expect(st).toHaveLength(5);
    console.log("Ganadores por ronda:", room.results.map((r) => r.ganadorId).join(" → "));
    console.log("Clasificación:", st.map((s) => `${s.teamId} ${s.total}`).join(", "));

    room.reset();
    expect(room.phase).toBe("lobby");
    expect(room.players.size).toBe(1);
    room.dispose();
  });

  it("cierra la ronda al acabar el tiempo y envía lo que hubiera", async () => {
    const room = new Room("TEST-02", () => {}, fallbackAria);
    const a = room.join("Leo", "ritmo").player!;
    room.startRound();
    room.updateDraft(a.id, "Reparables", ["ficha"]);
    room.tick(Date.now() + 10 * 60 * 1000);
    await waitFor(() => !room.thinking && room.results.length === 1);
    expect(room.results[0].decision.ranking[0].marca_id).toBe("ritmo");
    room.dispose();
  });

  it("el host no ve el contenido de las fichas durante la preparación", () => {
    const room = new Room("TEST-03", () => {}, fallbackAria);
    const a = room.join("Leo", "ritmo").player!;
    room.startRound();
    room.updateDraft(a.id, "secreto", ["ficha"]);
    expect(JSON.stringify(room.hostState())).not.toContain("secreto");
    room.dispose();
  });
});
