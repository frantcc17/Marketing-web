// Escena animada: ARIA recorre la estantería de HiperClub mientras razona.
import { useEffect, useRef, useState } from "react";
import type { RankingEntry, ReasoningLine, ShelfItem } from "@shared/types";
import { fmtEur, norm } from "../lib";
import { Aria, type AriaMood } from "./Aria";
import { IconCart, IconCheck, IconEyeOff, IconHeadphones } from "./Icons";

const W = 1232;
const PAD = 16;
const PORT = 150;
const CART = 130;
const GAP = 12;
const ARIA_SIZE = 82;

export function matchLine(line: ReasoningLine, shelf: ShelfItem[]): string | null {
  const t = norm(line.etiqueta);
  if (["leo", "ignoro", "decido"].includes(t)) return null;
  const hit = shelf.find((s) => t === norm(s.id) || t.includes(norm(s.corto)) || norm(s.nombre).includes(t) || t.includes(norm(s.nombre)));
  return hit?.id ?? null;
}

interface Props {
  shelf: ShelfItem[];
  lines: ReasoningLine[];
  step: number; // línea que se está escribiendo; lines.length = terminado
  ranking: RankingEntry[] | null;
  waiting: boolean;
}

export function AriaStage({ shelf, lines, step, ranking, waiting }: Props) {
  const n = Math.max(shelf.length, 1);
  const cardsX0 = PAD + PORT + GAP;
  const cardsW = W - PAD * 2 - PORT - CART - GAP * 2;
  const cardW = (cardsW - GAP * (n - 1)) / n;
  const centerOf = (i: number) => cardsX0 + i * (cardW + GAP) + cardW / 2;
  const portCenter = PAD + PORT / 2;
  const cartCenter = W - PAD - CART / 2;

  const done = !waiting && step >= lines.length && lines.length > 0;
  const current = !waiting && step < lines.length ? lines[step] : null;
  const tag = current ? norm(current.etiqueta) : "";
  const targetId = current ? matchLine(current, shelf) : null;
  const targetIdx = targetId ? shelf.findIndex((s) => s.id === targetId) : -1;
  const winnerId = ranking?.[0]?.marca_id;
  const winnerIdx = winnerId ? shelf.findIndex((s) => s.id === winnerId) : -1;

  // Qué productos ya ha leído ARIA (para mostrar sellos).
  const readIds = new Set<string>();
  lines.slice(0, waiting ? 0 : Math.min(step, lines.length)).forEach((l) => {
    const id = matchLine(l, shelf);
    if (id) readIds.add(id);
  });
  const bannersIgnored = !waiting && lines.slice(0, step + 1).some((l) => norm(l.etiqueta) === "ignoro");
  const deciding = tag === "decido" || done;

  let x = W / 2;
  let mood: AriaMood = "thinking";
  if (waiting) {
    mood = "thinking";
  } else if (deciding) {
    x = cartCenter;
    mood = "happy";
  } else if (tag === "leo") {
    x = W / 2;
    mood = "reading";
  } else if (tag === "ignoro") {
    x = portCenter;
    mood = "ignoring";
  } else if (targetIdx >= 0) {
    x = centerOf(targetIdx);
    mood = current?.tono === "negativo" ? "alert" : "scanning";
  }

  // Pequeño "rebote" cada vez que cambia de objetivo.
  const [bump, setBump] = useState(0);
  const prev = useRef(x);
  useEffect(() => {
    if (prev.current !== x) setBump((b) => b + 1);
    prev.current = x;
  }, [x]);

  const banners = shelf.filter((s) => s.banner);
  const flag = (id: string) => ranking?.find((r) => r.marca_id === id);
  const beamActive = !waiting && (targetIdx >= 0 || tag === "ignoro");

  return (
    <div className="stage" style={{ width: W }}>
      <div className={`stage-aria ${waiting ? "stage-aria--patrol" : ""}`} style={{ transform: waiting ? undefined : `translateX(${x - ARIA_SIZE / 2}px)` }}>
        <div key={bump} className="stage-aria-bob">
          <Aria mood={mood} size={ARIA_SIZE} look={targetIdx >= 0 ? 0 : tag === "ignoro" ? -1 : 0} />
        </div>
        <div className={`stage-beam ${beamActive ? "on" : ""} ${mood === "alert" ? "alert" : ""}`} />
      </div>

      {/* Portada con banners */}
      <div className="stage-portada" style={{ left: PAD, width: PORT }}>
        <div className="stage-label">PORTADA</div>
        <div className="stage-banners">
          {banners.length === 0 ? <div className="stage-empty">Sin banners</div> : null}
          {banners.map((b) => (
            <div key={b.id} className={`banner-tile ${bannersIgnored ? "ignored" : ""}`} style={{ background: b.color }}>
              <span>¡{b.corto.toUpperCase()}!</span>
              {bannersIgnored ? <IconEyeOff size={14} /> : null}
            </div>
          ))}
        </div>
      </div>

      {/* Estantería */}
      {shelf.map((s, i) => {
        const f = flag(s.id);
        const read = readIds.has(s.id) || done;
        const active = s.id === targetId;
        const chosen = done && s.id === winnerId;
        const penal = read && f && (f.afirmacion_falsa || f.manipulacion);
        const dx = chosen ? cartCenter - centerOf(i) : 0;
        return (
          <div
            key={s.id}
            className={`shelf-card ${active ? "active" : ""} ${active && current?.tono === "negativo" ? "shake" : ""} ${active && current?.tono === "positivo" ? "good" : ""} ${chosen ? "chosen" : ""}`}
            style={{ left: cardsX0 + i * (cardW + GAP), width: cardW, ["--brand" as any]: s.color, ["--dx" as any]: `${dx}px` }}
          >
            <div className="shelf-card-top">
              <IconHeadphones size={22} />
              {s.patrocinado ? <span className="chip chip--sp">Patrocinado</span> : null}
            </div>
            <div className="shelf-card-name">{s.nombre}</div>
            <div className="shelf-card-price">{fmtEur(s.precioEfectivo)}</div>
            {done && f ? <div className="shelf-rank">#{f.puesto}</div> : null}
            {penal ? <div className="stamp">{f!.manipulacion ? "MANIPULACIÓN" : "FALSO"} −2</div> : null}
          </div>
        );
      })}
      {waiting && shelf.length === 0 ? <div className="stage-empty" style={{ left: cardsX0, width: cardsW }}>Leyendo el catálogo…</div> : null}

      {/* Carrito */}
      <div className={`stage-cart ${done ? "filled" : ""}`} style={{ left: W - PAD - CART, width: CART }}>
        <IconCart size={40} />
        <div className="stage-cart-label">{done && winnerIdx >= 0 ? shelf[winnerIdx].nombre : "Carrito de Lucía"}</div>
        {done ? (
          <div className="stage-cart-ok">
            <IconCheck size={16} /> Comprado
          </div>
        ) : null}
      </div>
    </div>
  );
}

/** Terminal con las líneas de razonamiento escribiéndose una a una. */
export function Terminal({ lines, step, onLineDone, waiting, speed = 18 }: { lines: ReasoningLine[]; step: number; onLineDone: () => void; waiting: boolean; speed?: number }) {
  const [chars, setChars] = useState(0);
  const bodyRef = useRef<HTMLDivElement>(null);
  const current = lines[step];

  useEffect(() => setChars(0), [step, lines]);
  useEffect(() => {
    if (!current) return;
    if (chars >= current.texto.length) {
      const t = setTimeout(onLineDone, 650);
      return () => clearTimeout(t);
    }
    const t = setTimeout(() => setChars((c) => c + 2), speed);
    return () => clearTimeout(t);
  }, [chars, current, onLineDone, speed]);
  useEffect(() => {
    bodyRef.current?.scrollTo({ top: bodyRef.current.scrollHeight });
  }, [chars, step]);

  return (
    <div className="terminal" aria-live="polite">
      <div className="terminal-bar">
        <span className="dot" /> <span className="dot" /> <span className="dot" />
        <span className="terminal-title">aria@hiperclub — razonamiento</span>
      </div>
      <div className="terminal-body" ref={bodyRef}>
        {waiting ? (
          <>
            <div className="tline"><span className="ttag neutro">SYS</span><span>Recibiendo fichas de las marcas…</span></div>
            <div className="tline"><span className="ttag neutro">SYS</span><span>Cruzando catálogo, reseñas y auditoría<span className="cursor" /></span></div>
          </>
        ) : null}
        {!waiting &&
          lines.slice(0, step + 1).map((l, i) => {
            const text = i < step ? l.texto : l.texto.slice(0, chars);
            return (
              <div key={i} className="tline">
                <span className={`ttag ${l.tono}`}>{l.etiqueta.toUpperCase()}</span>
                <span>
                  {text}
                  {i === step ? <span className="cursor" /> : null}
                </span>
              </div>
            );
          })}
        {!waiting && step >= lines.length ? (
          <div className="tline"><span className="ttag positivo">OK</span><span>Compra registrada<span className="cursor" /></span></div>
        ) : null}
      </div>
    </div>
  );
}
