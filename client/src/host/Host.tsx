import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import type { HostState, RoundResult, Standing } from "@shared/types";
import { Aria, SpeechBubble } from "../components/Aria";
import { AriaStage, Terminal } from "../components/AriaStage";
import {
  IconAlert, IconArrow, IconBot, IconCheck, IconClock, IconLock, IconPlay, IconPlus, IconRefresh, IconStop, IconTrophy, IconUsers, IconWifi,
} from "../components/Icons";
import { ApiError, api, fmtTime, safeStorage, useConfig, useCountdown, usePoll, type PublicConfig } from "../lib";

const HOST_KEY = "cal:host";

/** Lienzo fijo de 1280×720 escalado para el proyector. */
function Canvas({ children }: { children: ReactNode }) {
  const [scale, setScale] = useState(1);
  useLayoutEffect(() => {
    const fit = () => setScale(Math.min(window.innerWidth / 1280, window.innerHeight / 720));
    fit();
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  }, []);
  return (
    <div className="canvas-wrap">
      <div className="canvas" style={{ transform: `scale(${scale})` }}>
        {children}
      </div>
    </div>
  );
}

interface HostSession {
  code: string;
  token: string;
}

function loadSession(): HostSession | null {
  // ?sala=CODIGO&token=... permite reabrir la pantalla del profesor en otro dispositivo.
  const qs = new URLSearchParams(location.search);
  const code = qs.get("sala")?.toUpperCase();
  const token = qs.get("token");
  if (code && token) return { code, token };
  try {
    const raw = safeStorage()?.getItem(HOST_KEY);
    return raw ? (JSON.parse(raw) as HostSession) : null;
  } catch {
    return null;
  }
}

export function Host() {
  const cfg = useConfig();
  const [session, setSession] = useState<HostSession | null>(loadSession);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const showError = useCallback((e: unknown) => {
    setError(e instanceof Error ? e.message : String(e));
    window.setTimeout(() => setError(null), 5000);
  }, []);

  const forget = useCallback(() => {
    safeStorage()?.removeItem(HOST_KEY);
    setSession(null);
  }, []);

  const { data: state, setData: setState, online } = usePoll<HostState>(
    session ? () => api<HostState>("host", { code: session.code, token: session.token }) : null,
    1000,
    (e) => {
      if (e instanceof ApiError && e.status === 404) forget();
      else showError(e);
    },
  );

  // Cuando la ronda queda pendiente de decisión, esta pantalla pide a ARIA que decida (una vez por petición).
  const askedRun = useRef<{ runId: number; at: number } | null>(null);
  useEffect(() => {
    if (!session || !state || state.phase !== "thinking" || !state.thinking) return;
    const prev = askedRun.current;
    if (prev && prev.runId === state.runId && Date.now() - prev.at < 160_000) return;
    askedRun.current = { runId: state.runId, at: Date.now() };
    api<HostState | { busy: true }>("aria", {}, { code: session.code, token: session.token })
      .then((r) => {
        if (r && "phase" in r) setState(r);
      })
      .catch(showError);
  }, [session, state, setState, showError]);

  const create = async () => {
    setBusy(true);
    try {
      const r = await api<HostSession>("create", {}, {});
      try { safeStorage()?.setItem(HOST_KEY, JSON.stringify(r)); } catch { /* sin almacenamiento */ }
      setSession(r);
    } catch (e) {
      showError(e);
    } finally {
      setBusy(false);
    }
  };

  const act = useCallback(
    (action: string, value?: number) => {
      if (!session) return;
      api<HostState>("action", {}, { code: session.code, token: session.token, action, value }).then(setState).catch(showError);
    },
    [session, setState, showError],
  );

  if (!cfg) return <Canvas><div className="center-msg">Cargando…</div></Canvas>;

  return (
    <Canvas>
      {!online ? <div className="toast toast--warn"><IconWifi size={16} /> Reconectando con el servidor…</div> : null}
      {error ? <div className="toast toast--warn"><IconAlert size={16} /> {error}</div> : null}
      {!session || !state ? (
        <Welcome onCreate={create} busy={busy || (!!session && !state)} />
      ) : (
        <HostScreens state={state} cfg={cfg} act={act} onNewGame={forget} />
      )}
    </Canvas>
  );
}

function Welcome({ onCreate, busy }: { onCreate: () => void; busy: boolean }) {
  return (
    <div className="welcome">
      <Aria mood="idle" size={180} />
      <h1 className="display">Convence al algoritmo</h1>
      <p className="lead">Año 2027. Lucía ya no compra: compra ARIA, su agente de IA. Cinco marcas de auriculares compiten por convencerla.</p>
      <button className="btn btn--primary btn--lg" onClick={onCreate} disabled={busy}>
        <IconPlay size={20} /> {busy ? "Preparando…" : "Crear partida"}
      </button>
    </div>
  );
}

function Header({ state, cfg, right }: { state: HostState; cfg: PublicConfig; right?: ReactNode }) {
  const round = cfg.rounds[state.roundIndex];
  return (
    <header className="h-header">
      <div className="h-brand">
        <span className="logo-dot" /> Convence al algoritmo
        <span className="mono muted"> · Sala {state.code}</span>
      </div>
      {state.phase !== "lobby" && state.phase !== "final" ? (
        <div className="h-round mono">
          RONDA {round.numero}/{cfg.rounds.length} · {round.nombre.toUpperCase()}
        </div>
      ) : null}
      <div className="h-right">{right}</div>
    </header>
  );
}

function HostScreens({ state, cfg, act, onNewGame }: { state: HostState; cfg: PublicConfig; act: (a: string, v?: number) => void; onNewGame: () => void }) {
  switch (state.phase) {
    case "lobby":
      return <Lobby state={state} cfg={cfg} act={act} onNewGame={onNewGame} />;
    case "prep":
      return <Prep state={state} cfg={cfg} act={act} />;
    case "thinking":
      return <Thinking state={state} cfg={cfg} act={act} />;
    case "results":
      return <Results state={state} cfg={cfg} act={act} />;
    case "final":
      return <Final state={state} cfg={cfg} act={act} />;
  }
}

// ---------------- Sala ----------------
function Lobby({ state, cfg, act, onNewGame }: { state: HostState; cfg: PublicConfig; act: (a: string, v?: number) => void; onNewGame: () => void }) {
  const teamsWithPlayers = state.teams.filter((t) => t.members.length > 0).length;
  const club = cfg.products.find((p) => p.id === "club")!;
  return (
    <div className="screen">
      <Header state={state} cfg={cfg} right={<IaBadge on={state.iaDisponible} />} />
      <div className="lobby">
        <section className="card lobby-join">
          <div className="label">CÓDIGO DE SALA</div>
          <div className="room-code">{state.code}</div>
          <img className="qr" src={state.qr} alt={`Código QR para unirse a la sala ${state.code}`} width={250} height={250} />
          <div className="mono small join-url">{state.joinUrl}</div>
          <div className="aria-hello">
            <Aria mood="idle" size={78} />
            <SpeechBubble>Hola, soy ARIA. Hoy compro para Lucía. Convencedme… con datos.</SpeechBubble>
          </div>
        </section>
        <section className="lobby-teams">
          <div className="row-between">
            <h2 className="h2">Marcas</h2>
            <div className="mono muted">{state.teams.reduce((n, t) => n + t.members.length, 0)} conectados</div>
          </div>
          <ul className="team-list">
            {state.teams.map((t) => {
              const p = cfg.products.find((x) => x.id === t.teamId)!;
              return (
                <li key={t.teamId} className="team-row" style={{ ["--brand" as any]: p.color }}>
                  <span className="brand-bar" />
                  <div className="team-name">{p.nombre}</div>
                  <div className="team-members">
                    {t.members.length === 0 ? <span className="muted">Esperando al grupo…</span> : null}
                    {t.members.map((m) => (
                      <span key={m.id} className={`member ${m.connected ? "" : "off"}`}>
                        {m.bot ? <IconBot size={14} /> : null}
                        {m.name}
                      </span>
                    ))}
                  </div>
                  <div className={`mono team-count ${t.members.length ? "lime" : ""}`}>{t.members.length ? "LISTO" : "LIBRE"}</div>
                </li>
              );
            })}
            <li className="team-row team-row--rival" style={{ ["--brand" as any]: club.color }}>
              <span className="brand-bar" />
              <div className="team-name">{club.nombre}</div>
              <div className="team-members muted">Marca blanca de HiperClub</div>
              <div className="mono rival-tag">RIVAL · entra en la ronda {cfg.config.rondaMarcaBlanca}</div>
            </li>
          </ul>
          <div className="lobby-controls">
            <label className="field-inline">
              <span className="mono small muted">Tiempo de preparación</span>
              <select value={state.prepSeconds} onChange={(e) => act("prepSeconds", Number(e.target.value))}>
                {[60, 120, 180, 240, 300].map((s) => (
                  <option key={s} value={s}>{fmtTime(s)}</option>
                ))}
              </select>
            </label>
            <button className="btn" onClick={() => act("demo")}>
              <IconBot size={18} /> Modo demo
            </button>
            <button className="btn btn--ghost" onClick={onNewGame} title="Crear una sala nueva">
              Nueva sala
            </button>
            <button className="btn btn--primary btn--lg" disabled={teamsWithPlayers === 0} onClick={() => act("start")}>
              <IconPlay size={20} /> Empezar ronda
            </button>
          </div>
        </section>
      </div>
    </div>
  );
}

function IaBadge({ on }: { on: boolean }) {
  return <span className={`badge ${on ? "badge--ok" : "badge--warn"}`}>{on ? "ARIA: IA conectada" : "ARIA: motor de respaldo"}</span>;
}

// ---------------- Preparación ----------------
function Prep({ state, cfg, act }: { state: HostState; cfg: PublicConfig; act: (a: string, v?: number) => void }) {
  const left = useCountdown(state.deadline, state.serverNow);
  const round = cfg.rounds[state.roundIndex];
  const active = state.teams.filter((t) => t.activo);
  const sent = active.filter((t) => t.submitted).length;
  return (
    <div className="screen">
      <Header state={state} cfg={cfg} right={<IaBadge on={state.iaDisponible} />} />
      <div className="prep">
        <section className="card prep-brief">
          <div className="label">ENCARGO DE LUCÍA</div>
          <p className="quote">«{round.encargo}»</p>
          <div className="prep-aria">
            <Aria mood={sent === active.length ? "happy" : "idle"} size={130} />
            <SpeechBubble>Esperando fichas: {sent}/{active.length}. Recordad: no veo banners.</SpeechBubble>
          </div>
          {round.numero === cfg.config.rondaMarcaBlanca ? (
            <div className="warn-box"><IconAlert size={18} /> Esta ronda entra Club Selección, la marca blanca del súper.</div>
          ) : null}
        </section>
        <section className="prep-right">
          <div className={`timer ${left <= 30 ? "timer--low" : ""}`}>
            <IconClock size={36} />
            <span className="mono">{fmtTime(left)}</span>
          </div>
          <div className="prep-teams">
            {active.map((t) => {
              const p = cfg.products.find((x) => x.id === t.teamId)!;
              return (
                <div key={t.teamId} className={`prep-team ${t.submitted ? "sent" : ""}`} style={{ ["--brand" as any]: p.color }}>
                  <span className="brand-bar" />
                  <div className="team-name">{p.nombre}</div>
                  <div className="mono small muted"><IconUsers size={14} /> {t.members.length}</div>
                  <div className={`status mono ${t.submitted ? "ok" : ""}`}>
                    {t.submitted ? <><IconCheck size={16} /> ENVIADO</> : <>PREPARANDO<span className="dots-anim" /></>}
                  </div>
                </div>
              );
            })}
          </div>
          <div className="controls">
            <button className="btn" onClick={() => act("addTime")}><IconPlus size={18} /> 30 s</button>
            <button className="btn btn--primary" onClick={() => act("close")}><IconStop size={18} /> Cerrar ronda</button>
          </div>
        </section>
      </div>
    </div>
  );
}

// ---------------- ARIA decide ----------------
function Thinking({ state, cfg, act }: { state: HostState; cfg: PublicConfig; act: (a: string, v?: number) => void }) {
  const round = cfg.rounds[state.roundIndex];
  const result: RoundResult | undefined = state.thinking ? undefined : state.results[state.roundIndex];
  const waiting = !result;
  const lines = result?.decision.lineas_razonamiento ?? [];
  const sig = result ? `${result.ronda}-${result.decision.decision_final}-${result.fuente}` : "";
  const [step, setStep] = useState(0);
  useEffect(() => setStep(0), [sig]);
  const next = useCallback(() => setStep((s) => s + 1), []);
  const done = !waiting && step >= lines.length;

  const placeholderShelf = state.teams
    .filter((t) => t.activo)
    .map((t) => cfg.products.find((p) => p.id === t.teamId)!)
    .concat(round.numero >= cfg.config.rondaMarcaBlanca ? [cfg.products.find((p) => p.id === "club")!] : [])
    .map((p) => ({ id: p.id, nombre: p.nombre, corto: p.corto, color: p.color, patrocinado: false, banner: false, precioEfectivo: p.precio }));

  return (
    <div className="screen">
      <Header
        state={state}
        cfg={cfg}
        right={result?.fuente === "respaldo" ? <span className="badge badge--warn" title={result.aviso}>Motor de respaldo</span> : <IaBadge on={state.iaDisponible} />}
      />
      <div className="thinking">
        <section className="card lucia">
          <div className="lucia-head">
            <div className="avatar">L</div>
            <div>
              <div className="h3">Lucía, 20</div>
              <div className="muted small">Estudiante · Madrid · app de HiperClub</div>
            </div>
          </div>
          <div className="label">ENCARGO</div>
          <p className="quote quote--sm">«{round.encargo}»</p>
          <div className="secret"><IconLock size={16} /> Pista del Club: oculta</div>
          <div className="thinking-status mono">
            {waiting ? "ARIA ESTÁ RAZONANDO…" : done ? "DECISIÓN TOMADA" : `LEYENDO ${Math.min(step + 1, lines.length)}/${lines.length}`}
          </div>
          <div className="controls controls--col">
            {done ? (
              <button className="btn btn--primary" onClick={() => act("reveal")}>Ver resultados <IconArrow size={18} /></button>
            ) : !waiting ? (
              <button className="btn btn--ghost" onClick={() => setStep(lines.length)}>Saltar animación</button>
            ) : null}
            {!state.thinking ? <button className="btn btn--ghost" onClick={() => act("retry")}><IconRefresh size={16} /> Repetir decisión</button> : null}
          </div>
        </section>
        <Terminal lines={lines} step={step} onLineDone={next} waiting={waiting} />
      </div>
      <AriaStage shelf={result?.shelf ?? placeholderShelf} lines={lines} step={step} ranking={result?.decision.ranking ?? null} waiting={waiting} />
    </div>
  );
}

// ---------------- Resultados ----------------
function Results({ state, cfg, act }: { state: HostState; cfg: PublicConfig; act: (a: string, v?: number) => void }) {
  const result = state.results[state.roundIndex];
  const round = cfg.rounds[state.roundIndex];
  if (!result) return null;
  const last = state.roundIndex >= cfg.rounds.length - 1;
  const lesson = LESSONS[state.roundIndex];
  return (
    <div className="screen">
      <Header state={state} cfg={cfg} right={result.fuente === "respaldo" ? <span className="badge badge--warn" title={result.aviso}>Motor de respaldo</span> : null} />
      <div className="results">
        <section className="ranking">
          <div className="decision mono">
            <Aria mood="happy" size={44} /> <span>{result.decision.decision_final}</span>
          </div>
          <ol className="rank-list">
            {result.decision.ranking.map((r) => {
              const p = cfg.products.find((x) => x.id === r.marca_id)!;
              const s = result.scores.find((x) => x.teamId === r.marca_id);
              return (
                <li key={r.marca_id} className={`rank-row ${r.puesto === 1 ? "first" : ""}`} style={{ ["--brand" as any]: p.color }}>
                  <span className="rank-pos mono">{r.puesto}</span>
                  <span className="brand-bar" />
                  <div className="rank-main">
                    <div className="rank-name">
                      {p.nombre}
                      {p.esMarcaBlanca ? <span className="chip chip--rival">MARCA BLANCA</span> : null}
                      {r.manipulacion ? <span className="chip chip--bad">Manipulación −{cfg.config.penalManip}</span> : null}
                      {r.afirmacion_falsa ? <span className="chip chip--bad" title={r.afirmacion_falsa_detalle}>Afirmación falsa −{cfg.config.penalFalsa}</span> : null}
                      {s?.recompra ? <span className="chip chip--good">Recompra +{s.recompra}</span> : null}
                    </div>
                    <div className="rank-why">{r.afirmacion_falsa && r.afirmacion_falsa_detalle ? r.afirmacion_falsa_detalle : r.motivo}</div>
                  </div>
                  <span className={`rank-pts mono ${s && s.total < 0 ? "neg" : ""}`}>{s ? `${s.total > 0 ? "+" : ""}${s.total}` : "—"}</span>
                </li>
              );
            })}
          </ol>
        </section>
        <aside className="results-side">
          <div className="lesson">
            <div className="label label--dark">LECCIÓN DE LA RONDA {round.numero}</div>
            <div className="lesson-title">{round.leccionTitulo}</div>
            <p>{round.leccion}</p>
            {lesson ? <p className="lesson-extra">{lesson}</p> : null}
          </div>
          <Scoreboard standings={state.standings} cfg={cfg} compact />
          {result.aviso ? <div className="muted small mono">{result.aviso}</div> : null}
          <div className="controls">
            <button className="btn btn--ghost" onClick={() => act("retry")}><IconRefresh size={16} /> Repetir</button>
            <button className="btn btn--primary" onClick={() => act("next")}>
              {last ? <>Ver podio <IconTrophy size={18} /></> : <>Siguiente ronda <IconArrow size={18} /></>}
            </button>
          </div>
        </aside>
      </div>
    </div>
  );
}

const LESSONS: string[] = [
  "Pregunta a la clase: ¿quién pagó un banner? ¿Qué vio ARIA de él?",
  "Pregunta: ¿qué equipos activaron Audiencia Club y cómo cambió su mensaje?",
  "Pregunta: ¿cómo se defiende una marca cuando el súper compite con ella en su propia tienda?",
  "Pregunta: ¿qué marca se vendió como «eco» sin datos? ¿Qué le pasó?",
];

function Scoreboard({ standings, cfg, compact }: { standings: Standing[]; cfg: PublicConfig; compact?: boolean }) {
  const max = Math.max(1, ...standings.map((s) => s.total));
  return (
    <div className={`card scoreboard ${compact ? "compact" : ""}`}>
      <div className="label">MARCADOR ACUMULADO</div>
      {standings.map((s, i) => {
        const p = cfg.products.find((x) => x.id === s.teamId)!;
        return (
          <div key={s.teamId} className="score-row" style={{ ["--brand" as any]: p.color }}>
            <span className="mono muted">{i + 1}</span>
            <span className="score-name">{p.nombre}</span>
            <span className="score-bar"><span style={{ width: `${(Math.max(0, s.total) / max) * 100}%` }} /></span>
            <span className={`mono score-pts ${s.total < 0 ? "neg" : ""}`}>{s.total}</span>
          </div>
        );
      })}
    </div>
  );
}

// ---------------- Final ----------------
function Final({ state, cfg, act }: { state: HostState; cfg: PublicConfig; act: (a: string, v?: number) => void }) {
  const top = state.standings.slice(0, 3);
  const order = [top[1], top[0], top[2]].filter(Boolean);
  return (
    <div className="screen">
      <Header state={state} cfg={cfg} right={<button className="btn btn--ghost" onClick={() => act("reset")}><IconRefresh size={16} /> Reiniciar partida</button>} />
      <div className="final">
        <section className="podium-wrap">
          <h1 className="h1">Podio final</h1>
          <div className="podium">
            {order.map((s) => {
              const place = state.standings.indexOf(s) + 1;
              const p = cfg.products.find((x) => x.id === s.teamId)!;
              return (
                <div key={s.teamId} className={`podium-col p${place}`} style={{ ["--brand" as any]: p.color }}>
                  {place === 1 ? <Aria mood="happy" size={72} /> : null}
                  <div className="podium-name">{p.nombre}</div>
                  <div className="mono podium-pts">{s.total} pts</div>
                  <div className="podium-block mono">{place}</div>
                </div>
              );
            })}
          </div>
          <Scoreboard standings={state.standings} cfg={cfg} compact />
        </section>
        <section className="final-lessons">
          <h2 className="h2">Lo que hemos aprendido</h2>
          {cfg.rounds.map((r) => (
            <div key={r.numero} className="card final-lesson">
              <div className="mono small lime">RONDA {r.numero}</div>
              <div className="h3">{r.leccionTitulo}</div>
              <p className="muted">{r.leccion}</p>
            </div>
          ))}
          <div className="card final-lesson">
            <div className="mono small lime">BONUS</div>
            <div className="h3">El agente trabaja para el consumidor.</div>
            <p className="muted">Mentir o intentar dar órdenes a la IA se detecta y cuesta caro: −{cfg.config.penalManip} puntos y caer en el ranking.</p>
          </div>
        </section>
      </div>
    </div>
  );
}

