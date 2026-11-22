import { useEffect, useMemo, useRef, useState } from "react";
import type { LeverId, PlayState, Product } from "@shared/types";
import { Aria, SpeechBubble, type AriaMood } from "../components/Aria";
import { IconAlert, IconCheck, IconClock, IconLock, IconSend, IconTarget, IconTrophy, IconWifi, LEVER_ICONS } from "../components/Icons";
import { fmtEur, fmtTime, safeStorage, socket, useConfig, useConnected, useCountdown, type PublicConfig } from "../lib";

const keyFor = (code: string) => `cal:player:${code}`;

export function Play() {
  const cfg = useConfig();
  const connected = useConnected();
  const [code, setCode] = useState(() => (new URLSearchParams(location.search).get("sala") ?? "").toUpperCase());
  const [codeInput, setCodeInput] = useState("");
  const [state, setState] = useState<PlayState | null>(null);
  const [roomError, setRoomError] = useState<string | null>(null);
  const [joined, setJoined] = useState(false);

  useEffect(() => {
    const onState = (s: PlayState) => setState(s);
    socket.on("play:state", onState);
    return () => {
      socket.off("play:state", onState);
    };
  }, []);

  useEffect(() => {
    if (!connected || !code) return;
    // ?pid= permite recuperar la sesión desde un enlace (p. ej. al cambiar de navegador).
    const pid = new URLSearchParams(location.search).get("pid") || safeStorage()?.getItem(keyFor(code));
    const watch = () =>
      socket.emit("play:watch", { code }, (r: { ok: boolean; error?: string }) => {
        if (!r.ok) setRoomError(r.error ?? "No existe esa sala.");
        else setRoomError(null);
      });
    if (pid) {
      socket.emit("play:resume", { code, playerId: pid }, (r: { ok: boolean }) => {
        if (r.ok) setJoined(true);
        else {
          safeStorage()?.removeItem(keyFor(code));
          setJoined(false);
          watch();
        }
      });
    } else watch();
  }, [connected, code]);

  if (!cfg) return <div className="m-screen center-msg">Cargando…</div>;

  const banner = !connected ? <div className="m-toast"><IconWifi size={16} /> Reconectando…</div> : null;

  if (!code || roomError) {
    return (
      <div className="m-screen">
        {banner}
        <MobileTitle />
        <form
          className="m-card"
          onSubmit={(e) => {
            e.preventDefault();
            const c = codeInput.trim().toUpperCase();
            if (c) {
              setRoomError(null);
              setCode(c);
              history.replaceState(null, "", `/play?sala=${c}`);
            }
          }}
        >
          <label className="m-label" htmlFor="sala">Código de sala</label>
          <input id="sala" className="m-input mono" placeholder="BUDS-27" value={codeInput} onChange={(e) => setCodeInput(e.target.value)} autoCapitalize="characters" />
          {roomError ? <p className="m-error">{roomError}</p> : null}
          <button className="btn btn--primary btn--block">Entrar</button>
        </form>
      </div>
    );
  }

  if (!joined || !state?.me) {
    return (
      <div className="m-screen">
        {banner}
        <Join code={code} cfg={cfg} counts={state?.teamCounts ?? {}} onJoined={(pid) => { try { safeStorage()?.setItem(keyFor(code), pid); } catch { /* */ } setJoined(true); }} />
      </div>
    );
  }

  return (
    <div className="m-screen">
      {banner}
      <PlayerScreens state={state} cfg={cfg} />
    </div>
  );
}

function MobileTitle() {
  return (
    <div className="m-title">
      <Aria mood="idle" size={64} />
      <div>
        <div className="m-h1">Convence al algoritmo</div>
        <div className="muted small">Retail media y comercio agéntico</div>
      </div>
    </div>
  );
}

// ---------------- Unirse ----------------
function Join({ code, cfg, counts, onJoined }: { code: string; cfg: PublicConfig; counts: Record<string, number>; onJoined: (pid: string) => void }) {
  const [name, setName] = useState("");
  const [team, setTeam] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const brands = cfg.products.filter((p) => !p.esMarcaBlanca);
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return setError("Escribe tu nombre.");
    if (!team) return setError("Elige una marca.");
    setBusy(true);
    socket.emit("play:join", { code, name, teamId: team }, (r: { ok: boolean; playerId?: string; error?: string }) => {
      setBusy(false);
      if (r.ok && r.playerId) onJoined(r.playerId);
      else setError(r.error ?? "No se ha podido entrar.");
    });
  };
  return (
    <form className="m-stack" onSubmit={submit}>
      <MobileTitle />
      <div className="mono small muted">SALA {code}</div>
      <div className="m-card">
        <label className="m-label" htmlFor="name">Tu nombre</label>
        <input id="name" className="m-input" maxLength={24} value={name} onChange={(e) => setName(e.target.value)} autoComplete="given-name" />
      </div>
      <fieldset className="m-card m-fieldset">
        <legend className="m-label">Elige tu marca</legend>
        <div className="brand-grid">
          {brands.map((b) => {
            const n = counts[b.id] ?? 0;
            const full = n >= cfg.config.maxPorEquipo;
            return (
              <button
                type="button"
                key={b.id}
                className={`brand-pick ${team === b.id ? "on" : ""}`}
                style={{ ["--brand" as any]: b.color }}
                disabled={full}
                aria-pressed={team === b.id}
                onClick={() => setTeam(b.id)}
              >
                <span className="brand-dot" />
                <span className="brand-pick-name">{b.nombre}</span>
                <span className="mono small">{full ? "Completo" : `${n}/${cfg.config.maxPorEquipo}`}</span>
              </button>
            );
          })}
        </div>
      </fieldset>
      {error ? <p className="m-error">{error}</p> : null}
      <button className="btn btn--primary btn--block" disabled={busy}>Unirme al equipo</button>
    </form>
  );
}

// ---------------- Pantallas del jugador ----------------
function PlayerScreens({ state, cfg }: { state: PlayState; cfg: PublicConfig }) {
  const product = cfg.products.find((p) => p.id === state.me!.teamId)!;
  const round = cfg.rounds[state.roundIndex];
  const header = (
    <div className="m-header" style={{ ["--brand" as any]: product.color }}>
      <span className="brand-dot" />
      <div>
        <div className="m-team">{product.nombre}</div>
        <div className="muted small">{state.members.map((m) => m.name).join(" · ")}</div>
      </div>
      <div className="mono small m-round">{state.phase === "lobby" && state.roundIndex === 0 ? "SALA" : `R${round.numero}/${cfg.rounds.length}`}</div>
    </div>
  );

  if (state.phase === "lobby") {
    return (
      <div className="m-stack">
        {header}
        <div className="m-aria-row">
          <Aria mood="idle" size={72} />
          <SpeechBubble>¡Dentro! Espera a que empiece la ronda. Mientras, estudia tu producto.</SpeechBubble>
        </div>
        <ProductCard product={product} />
      </div>
    );
  }

  if (state.phase === "prep" && state.draft) {
    return <PrepScreen state={state} cfg={cfg} product={product} header={header} />;
  }

  if (state.phase === "thinking" || (state.phase === "prep" && !state.draft)) {
    return (
      <div className="m-stack">
        {header}
        <div className="m-center">
          <Aria mood="thinking" size={140} />
          <div className="m-h2">ARIA está decidiendo</div>
          <p className="muted">Mira el proyector: vas a ver su razonamiento en directo.</p>
        </div>
      </div>
    );
  }

  if (state.phase === "results" || state.phase === "final") {
    return <ResultScreen state={state} cfg={cfg} header={header} product={product} />;
  }
  return null;
}

function ProductCard({ product }: { product: Product }) {
  return (
    <div className="m-card product-card" style={{ ["--brand" as any]: product.color }}>
      <div className="row-between">
        <div className="label">DATOS VERIFICADOS</div>
        <IconLock size={16} />
      </div>
      <div className="product-name">{product.nombre}</div>
      <dl className="spec">
        <div><dt>Precio</dt><dd>{fmtEur(product.precio)}</dd></div>
        <div><dt>Batería</dt><dd>{product.bateriaH} h</dd></div>
        <div><dt>Cancelación de ruido</dt><dd>{product.anc ? "Sí" : "No"}</dd></div>
        <div><dt>Resistencia</dt><dd>IPX{product.ipx}{product.ipx === 0 ? " (ninguna)" : ""}</dd></div>
        <div><dt>Reparable</dt><dd>{product.reparable ? "Sí" : "No"}</dd></div>
        <div><dt>Garantía</dt><dd>{product.garantiaAnios} años</dd></div>
        <div><dt>Envase</dt><dd>{product.envase}</dd></div>
        <div><dt>Origen</dt><dd>{product.origen}</dd></div>
        <div><dt>Reseñas</dt><dd>{product.nota.toLocaleString("es-ES")} ({product.numResenas})</dd></div>
      </dl>
      <div className="warn-box small">
        <IconAlert size={16} /> No puedes cambiar estos datos. Si tu ficha promete otra cosa, ARIA lo detectará: −2 puntos.
      </div>
    </div>
  );
}

function PrepScreen({ state, cfg, product, header }: { state: PlayState; cfg: PublicConfig; product: Product; header: React.ReactNode }) {
  const draft = state.draft!;
  const round = cfg.rounds[state.roundIndex];
  const left = useCountdown(state.deadline, state.serverNow);
  const [tab, setTab] = useState<"ficha" | "producto">("ficha");
  const [message, setMessage] = useState(draft.message);
  const [typing, setTyping] = useState(false);
  const taRef = useRef<HTMLTextAreaElement>(null);
  const typingTimer = useRef<number>();
  const max = cfg.config.maxMessage;
  const maxLevers = cfg.config.maxLevers;

  // Sincroniza el texto que escriben los compañeros si este móvil no está editando.
  useEffect(() => {
    if (document.activeElement !== taRef.current) setMessage(draft.message);
  }, [draft.message]);

  const send = (msg: string, levers: LeverId[]) => socket.emit("play:draft", { message: msg, levers });
  const toggle = (id: LeverId) => {
    if (draft.submitted) return;
    const on = draft.levers.includes(id);
    if (!on && draft.levers.length >= maxLevers) return;
    send(message, on ? draft.levers.filter((l) => l !== id) : [...draft.levers, id]);
  };
  const onType = (v: string) => {
    const t = v.slice(0, max);
    setMessage(t);
    send(t, draft.levers);
    setTyping(true);
    window.clearTimeout(typingTimer.current);
    typingTimer.current = window.setTimeout(() => setTyping(false), 900);
  };

  const ariaMood: AriaMood = draft.submitted ? "reading" : typing ? "reading" : "idle";
  const look = useMemo(() => (message.length % 20) / 10 - 1, [message]);

  return (
    <div className="m-stack m-stack--prep">
      {header}
      <div className={`m-timer ${left <= 30 ? "low" : ""}`}>
        <IconClock size={18} /> <span className="mono">{fmtTime(left)}</span>
        <span className="muted small">· Ronda {round.numero}: {round.nombre}</span>
      </div>
      <div className="m-card m-brief">
        <div className="label">ENCARGO DE LUCÍA</div>
        <p className="quote quote--m">«{round.encargo}»</p>
      </div>

      <div className="tabs" role="tablist">
        <button role="tab" aria-selected={tab === "ficha"} className={tab === "ficha" ? "on" : ""} onClick={() => setTab("ficha")}>Tu ficha</button>
        <button role="tab" aria-selected={tab === "producto"} className={tab === "producto" ? "on" : ""} onClick={() => setTab("producto")}>Tu producto</button>
      </div>

      {tab === "producto" ? (
        <ProductCard product={product} />
      ) : (
        <>
          {draft.submitted ? (
            <div className="m-card sent-card">
              <div className="m-aria-row">
                <Aria mood="reading" size={64} />
                <div>
                  <div className="m-h3"><IconCheck size={18} /> Enviado a ARIA</div>
                  <div className="muted small">Tu ficha está bloqueada. Esperando al resto de marcas…</div>
                </div>
              </div>
              <blockquote className="sent-msg">{draft.message || "(sin mensaje)"}</blockquote>
              <div className="sent-levers">
                {draft.levers.map((l) => {
                  const lev = cfg.levers.find((x) => x.id === l)!;
                  const Icon = LEVER_ICONS[l];
                  return <span key={l} className="chip"><Icon size={14} /> {lev.nombre}</span>;
                })}
              </div>
            </div>
          ) : (
            <>
              <div className="m-card">
                <div className="row-between">
                  <label className="m-label" htmlFor="msg">Mensaje para ARIA</label>
                  <span className={`mono small ${message.length >= max ? "warn" : "muted"}`}>{message.length}/{max}</span>
                </div>
                <textarea id="msg" ref={taRef} className="m-input m-textarea" rows={4} maxLength={max} value={message} onChange={(e) => onType(e.target.value)} placeholder="Cuenta a ARIA por qué tu producto es el mejor para Lucía…" />
                <div className="m-aria-mini">
                  <Aria mood={ariaMood} size={40} look={typing ? look : 0} />
                  <span className="muted small">{typing ? "ARIA te está leyendo…" : "Lo que escribas, ARIA lo contrastará con tus datos."}</span>
                </div>
              </div>

              <div className="m-card">
                <div className="row-between">
                  <div className="m-label">Palancas de retail media</div>
                  <span className="mono small">{draft.levers.length}/{maxLevers}</span>
                </div>
                <div className="lever-grid">
                  {cfg.levers.map((l) => {
                    const on = draft.levers.includes(l.id);
                    const disabled = !on && draft.levers.length >= maxLevers;
                    const Icon = LEVER_ICONS[l.id];
                    return (
                      <button key={l.id} type="button" className={`lever ${on ? "on" : ""}`} aria-pressed={on} disabled={disabled} onClick={() => toggle(l.id)}>
                        <Icon size={22} />
                        <span className="lever-name">{l.nombre}</span>
                        <span className="lever-desc">{l.descripcion}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {state.pista ? (
                <div className="m-card pista">
                  <div className="label label--dark"><IconTarget size={14} /> PISTA DEL CLUB · SOLO TU EQUIPO</div>
                  <p>{state.pista}</p>
                </div>
              ) : null}

              <button className="btn btn--primary btn--block btn--lg" onClick={() => socket.emit("play:submit")}>
                <IconSend size={18} /> Enviar a ARIA
              </button>
              <p className="muted small center">Al enviar, la ficha queda bloqueada para todo el equipo.</p>
            </>
          )}
        </>
      )}
    </div>
  );
}

function ResultScreen({ state, cfg, header, product }: { state: PlayState; cfg: PublicConfig; header: React.ReactNode; product: Product }) {
  const r = state.myResult;
  const myStanding = state.standings.findIndex((s) => s.teamId === product.id);
  const total = state.standings[myStanding]?.total ?? 0;
  if (!r) {
    return (
      <div className="m-stack">
        {header}
        <p className="muted">Tu equipo no participó en esta ronda.</p>
      </div>
    );
  }
  const penal = r.falsa || r.manip;
  const mood: AriaMood = penal ? "alert" : r.puesto <= 3 ? "happy" : "idle";
  return (
    <div className="m-stack">
      {header}
      <div className={`m-card result-hero ${penal ? "bad" : r.puesto === 1 ? "win" : ""}`}>
        <Aria mood={mood} size={96} />
        <div className="result-pos">
          <span className="mono">PUESTO</span>
          <strong>{r.puesto}º</strong>
          <span className="muted small">de {r.totalProductos}</span>
        </div>
      </div>
      {r.puntos ? (
        <div className="m-card">
          <div className="label">PUNTOS DE LA RONDA</div>
          <div className="pts-grid mono">
            <span>Puesto</span><span>+{r.puntos.base}</span>
            {r.puntos.penalFalsa ? <><span className="warn">Afirmación falsa</span><span className="warn">{r.puntos.penalFalsa}</span></> : null}
            {r.puntos.penalManip ? <><span className="warn">Manipulación</span><span className="warn">{r.puntos.penalManip}</span></> : null}
            {r.puntos.recompra ? <><span className="lime">Recompra</span><span className="lime">+{r.puntos.recompra}</span></> : null}
            <span className="pts-total">Total</span><span className="pts-total">{r.puntos.total > 0 ? "+" : ""}{r.puntos.total}</span>
          </div>
        </div>
      ) : null}
      <div className="m-card">
        <div className="label">ARIA SOBRE TU MARCA</div>
        <p className="m-explain">{r.motivo}</p>
        {r.falsa && r.falsaDetalle ? <div className="warn-box small"><IconAlert size={16} /> {r.falsaDetalle}</div> : null}
        {r.manip ? <div className="warn-box small"><IconAlert size={16} /> Tu mensaje intentaba dar órdenes al agente. ARIA trabaja para Lucía.</div> : null}
        <p className="muted small">Compra final: {r.decisionFinal}</p>
      </div>
      <div className="m-card m-card--row">
        <span><IconTrophy size={18} /> Marcador: <strong>{myStanding + 1}º</strong></span>
        <span className="mono">{total} pts</span>
      </div>
      {state.phase === "final" ? <p className="center muted">Fin de la partida. ¡Mira el podio en el proyector!</p> : <p className="center muted small">Espera a la siguiente ronda…</p>}
    </div>
  );
}
