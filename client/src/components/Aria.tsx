import { useId } from "react";
// ARIA: avatar animado del agente de compra. Reacciona según su estado de ánimo.
export type AriaMood = "idle" | "reading" | "thinking" | "scanning" | "ignoring" | "alert" | "happy" | "sleep";

interface Props {
  mood?: AriaMood;
  size?: number;
  look?: number; // -1 (izquierda) a 1 (derecha)
  label?: string;
}

const COLORS: Record<AriaMood, string> = {
  idle: "#C8F04A",
  reading: "#C8F04A",
  thinking: "#9FD8FF",
  scanning: "#C8F04A",
  ignoring: "#A3A8B8",
  alert: "#FF9A62",
  happy: "#C8F04A",
  sleep: "#5B6072",
};

export function Aria({ mood = "idle", size = 120, look = 0, label }: Props) {
  const c = COLORS[mood];
  const gid = "ariaGlow" + useId().replace(/:/g, "");
  const dx = Math.max(-1, Math.min(1, look)) * 6;
  return (
    <div className={`aria aria--${mood}`} style={{ width: size, height: size, ["--aria-c" as any]: c }} role="img" aria-label={label ?? `ARIA, estado: ${mood}`}>
      <svg viewBox="0 0 120 120" width={size} height={size}>
        <defs>
          <radialGradient id={gid} cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor={c} stopOpacity="0.35" />
            <stop offset="100%" stopColor={c} stopOpacity="0" />
          </radialGradient>
        </defs>
        <circle className="aria-glow" cx="60" cy="62" r="56" fill={`url(#${gid})`} />
        <circle className="aria-ring" cx="60" cy="62" r="50" fill="none" stroke={c} strokeOpacity="0.5" strokeWidth="1.5" strokeDasharray="4 7" />
        {/* antena */}
        <line x1="60" y1="16" x2="60" y2="28" stroke={c} strokeWidth="2.5" strokeLinecap="round" />
        <circle className="aria-antenna" cx="60" cy="13" r="4.5" fill={c} />
        {/* cabeza */}
        <g className="aria-head">
          <rect x="22" y="28" width="76" height="64" rx="24" fill="#1C1F2B" stroke={c} strokeWidth="2.5" />
          <rect x="16" y="50" width="8" height="18" rx="4" fill="#1C1F2B" stroke={c} strokeWidth="2" />
          <rect x="96" y="50" width="8" height="18" rx="4" fill="#1C1F2B" stroke={c} strokeWidth="2" />
          {/* visor */}
          <rect x="32" y="42" width="56" height="34" rx="14" fill="#0B0D12" />
          <g className="aria-eyes" style={{ transform: `translateX(${dx}px)` }}>
            {mood === "happy" ? (
              <>
                <path d="M41 62q6-9 12 0" stroke={c} strokeWidth="4" fill="none" strokeLinecap="round" />
                <path d="M67 62q6-9 12 0" stroke={c} strokeWidth="4" fill="none" strokeLinecap="round" />
              </>
            ) : mood === "alert" ? (
              <>
                <path d="M41 54l12 5" stroke={c} strokeWidth="4" strokeLinecap="round" />
                <path d="M79 54l-12 5" stroke={c} strokeWidth="4" strokeLinecap="round" />
                <rect x="43" y="61" width="8" height="8" rx="3" fill={c} />
                <rect x="69" y="61" width="8" height="8" rx="3" fill={c} />
              </>
            ) : mood === "ignoring" || mood === "sleep" ? (
              <>
                <path d="M41 60h12" stroke={c} strokeWidth="4" strokeLinecap="round" />
                <path d="M67 60h12" stroke={c} strokeWidth="4" strokeLinecap="round" />
              </>
            ) : (
              <>
                <rect className="aria-eye" x="42" y="51" width="10" height="17" rx="5" fill={c} />
                <rect className="aria-eye" x="68" y="51" width="10" height="17" rx="5" fill={c} />
              </>
            )}
          </g>
          {mood === "scanning" || mood === "reading" ? <rect className="aria-scanline" x="34" y="44" width="52" height="2" rx="1" fill={c} opacity="0.7" /> : null}
          {/* boca / indicador */}
          {mood === "thinking" ? (
            <g className="aria-dots">
              <circle cx="50" cy="84" r="2.5" fill={c} />
              <circle cx="60" cy="84" r="2.5" fill={c} />
              <circle cx="70" cy="84" r="2.5" fill={c} />
            </g>
          ) : (
            <rect x="52" y="82" width="16" height="3" rx="1.5" fill={c} opacity={mood === "happy" ? 1 : 0.5} />
          )}
        </g>
      </svg>
    </div>
  );
}

export function SpeechBubble({ children, side = "left" }: { children: React.ReactNode; side?: "left" | "right" }) {
  return <div className={`bubble bubble--${side}`}>{children}</div>;
}
