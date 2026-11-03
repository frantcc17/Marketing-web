import './styles/main.css';
import './styles/strategy.css';
import { euro } from './data/products';
import { LEADERSHIP_GOAL, OBJECTIVES, PHASES, QUARTERS, type Phase } from './data/strategy';

const $ = <T extends Element = HTMLElement>(sel: string): T => document.querySelector<T>(sel)!;
const kEur = (n: number): string => `${Math.round(n / 1000).toLocaleString('es-ES')} k€`;

const ICONS: Record<string, string> = {
  trophy: '<path d="M8 4h8v5a4 4 0 0 1-8 0V4ZM8 6H5a3 3 0 0 0 3 4M16 6h3a3 3 0 0 1-3 4M12 13v4M8 20h8M9 17h6"/>',
  chart: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
  growth: '<path d="m3 17 6-6 4 4 8-8M15 7h6v6"/>',
};

// --- Objetivos ---
$('[data-objectives]').innerHTML = OBJECTIVES.map(
  (o) => `
  <article class="objective">
    <svg viewBox="0 0 24 24" aria-hidden="true">${ICONS[o.icon]}</svg>
    <h3>${o.title}</h3>
    <p>${o.text}</p>
  </article>`,
).join('');

// --- KPIs ---
const total = QUARTERS.reduce((s, q) => s + q.budget, 0);
const peak = Math.max(...QUARTERS.map((q) => q.budget));
const kpis = [
  { label: 'Inversión total (20 trimestres)', value: euro(total) },
  { label: 'Arranque (fase de introducción)', value: '30–40 k€' },
  { label: 'Pico de expansión / recorte', value: '200 → 150 k€' },
  { label: 'Inversión trimestral máxima', value: kEur(peak) },
];
$('[data-kpis]').innerHTML = kpis
  .map((k) => `<div class="kpi"><strong>${k.value}</strong><span>${k.label}</span></div>`)
  .join('');

// --- Leyenda de fases ---
$('[data-legend]').innerHTML = (Object.entries(PHASES) as [Phase, (typeof PHASES)[Phase]][])
  .map(([, p]) => `<span title="${p.note}"><i style="background:${p.color}"></i>${p.label}</span>`)
  .join('');

// --- Gráfico de barras (SVG) ---
function renderChart(): void {
  const host = $('[data-chart]');
  const tip = $('[data-tip]');
  host.querySelector('svg')?.remove();

  const W = 1000;
  const H = 380;
  const pad = { top: 20, right: 10, bottom: 34, left: 56 };
  const max = 750_000;
  const bw = (W - pad.left - pad.right) / QUARTERS.length;
  const y = (v: number): number => pad.top + (H - pad.top - pad.bottom) * (1 - v / max);

  const grid = [0, 150_000, 300_000, 450_000, 600_000, 750_000]
    .map(
      (v) => `<line x1="${pad.left}" x2="${W - pad.right}" y1="${y(v)}" y2="${y(v)}" class="grid-line"/>
              <text x="${pad.left - 10}" y="${y(v) + 4}" class="axis" text-anchor="end">${kEur(v)}</text>`,
    )
    .join('');

  const bars = QUARTERS.map((q, i) => {
    const x = pad.left + i * bw + bw * 0.16;
    const w = bw * 0.68;
    const top = y(q.budget);
    return `<g class="bar" data-i="${i}" style="--d:${i * 40}ms">
        <rect x="${pad.left + i * bw}" y="${pad.top}" width="${bw}" height="${H - pad.top - pad.bottom}" class="bar__hit"/>
        <rect x="${x}" y="${top}" width="${w}" height="${y(0) - top}" rx="4" fill="${PHASES[q.phase].color}" class="bar__fill"/>
        <text x="${x + w / 2}" y="${H - 12}" class="axis" text-anchor="middle">T${q.q}</text>
      </g>`;
  }).join('');

  const svg = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Presupuesto publicitario por trimestre">${grid}${bars}</svg>`;
  host.insertAdjacentHTML('afterbegin', svg);

  host.querySelectorAll<SVGGElement>('.bar').forEach((g) => {
    const q = QUARTERS[Number(g.dataset.i)];
    g.addEventListener('pointerenter', () => {
      const r = g.querySelector('.bar__fill')!.getBoundingClientRect();
      const hr = host.getBoundingClientRect();
      tip.hidden = false;
      tip.innerHTML = `<b>Trimestre ${q.q}</b>${euro(q.budget)}<small>${PHASES[q.phase].label}</small>`;
      tip.style.left = `${r.left - hr.left + r.width / 2}px`;
      tip.style.top = `${r.top - hr.top}px`;
    });
    g.addEventListener('pointerleave', () => (tip.hidden = true));
  });

  const io = new IntersectionObserver(([entry]) => {
    if (entry.isIntersecting) {
      host.classList.add('is-drawn');
      io.disconnect();
    }
  });
  io.observe(host);
}
renderChart();

// --- Tracker de liderazgo ---
const KEY = 'compumax:liderazgo';
let led: number[] = [];
try {
  led = JSON.parse(localStorage.getItem(KEY) ?? '[]') as number[];
} catch {
  led = [];
}

const quartersEl = $('[data-quarters]');
const ring = $<SVGCircleElement>('[data-ring]');
const countEl = $('[data-leader-count]');
const circumference = 2 * Math.PI * 52;
ring.style.strokeDasharray = String(circumference);

function renderLeader(): void {
  quartersEl.innerHTML = QUARTERS.map(
    (q) =>
      `<button type="button" aria-pressed="${led.includes(q.q)}" data-q="${q.q}" title="Trimestre ${q.q}">T${q.q}</button>`,
  ).join('');
  const progress = Math.min(led.length / LEADERSHIP_GOAL, 1);
  ring.style.strokeDashoffset = String(circumference * (1 - progress));
  ring.classList.toggle('is-done', led.length >= LEADERSHIP_GOAL);
  countEl.textContent = String(led.length);
  try {
    localStorage.setItem(KEY, JSON.stringify(led));
  } catch {
    /* sin almacenamiento: el progreso vive solo en esta sesión */
  }
}

quartersEl.addEventListener('click', (e) => {
  const btn = (e.target as HTMLElement).closest<HTMLButtonElement>('[data-q]');
  if (!btn) return;
  const q = Number(btn.dataset.q);
  led = led.includes(q) ? led.filter((x) => x !== q) : [...led, q];
  renderLeader();
});
renderLeader();
