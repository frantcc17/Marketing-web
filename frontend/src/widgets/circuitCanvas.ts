// Fondo animado del hero: pistas de circuito con pulsos de luz que viajan por ellas,
// inspirado en las líneas de placa base del logo de CompuMax.

interface Track {
  points: { x: number; y: number }[];
  length: number;
}

interface Pulse {
  track: Track;
  t: number;
  speed: number;
  hue: number;
}

const prefersReducedMotion = (): boolean => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

export function mountCircuitCanvas(canvas: HTMLCanvasElement): void {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  let tracks: Track[] = [];
  let pulses: Pulse[] = [];
  let width = 0;
  let height = 0;
  const mouse = { x: -9999, y: -9999 };

  const buildTracks = (): void => {
    tracks = [];
    const count = Math.round(width / 70);
    for (let i = 0; i < count; i++) {
      const fromLeft = i % 2 === 0;
      let x = fromLeft ? 0 : width;
      let y = Math.random() * height;
      const points = [{ x, y }];
      const segments = 3 + Math.floor(Math.random() * 3);
      for (let s = 0; s < segments; s++) {
        const dx = (fromLeft ? 1 : -1) * (60 + Math.random() * 160);
        // Pistas en horizontal y en diagonal de 45º, como en una PCB.
        const diagonal = Math.random() > 0.5;
        x += dx;
        y += diagonal ? (Math.random() > 0.5 ? 1 : -1) * Math.abs(dx) * 0.6 : 0;
        points.push({ x, y });
      }
      let length = 0;
      for (let p = 1; p < points.length; p++) {
        length += Math.hypot(points[p].x - points[p - 1].x, points[p].y - points[p - 1].y);
      }
      tracks.push({ points, length });
    }
    pulses = tracks.map((track) => ({
      track,
      t: Math.random(),
      speed: 0.0015 + Math.random() * 0.003,
      hue: Math.random() > 0.85 ? 270 : 210,
    }));
  };

  const resize = (): void => {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    width = canvas.clientWidth;
    height = canvas.clientHeight;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    buildTracks();
  };

  const pointAt = (track: Track, t: number): { x: number; y: number } => {
    let target = track.length * t;
    for (let p = 1; p < track.points.length; p++) {
      const a = track.points[p - 1];
      const b = track.points[p];
      const seg = Math.hypot(b.x - a.x, b.y - a.y);
      if (target <= seg) {
        const k = target / seg;
        return { x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k };
      }
      target -= seg;
    }
    return track.points[track.points.length - 1];
  };

  const draw = (): void => {
    ctx.clearRect(0, 0, width, height);

    ctx.lineWidth = 1;
    for (const track of tracks) {
      ctx.strokeStyle = 'rgba(30, 144, 255, 0.14)';
      ctx.beginPath();
      track.points.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
      ctx.stroke();
      const end = track.points[track.points.length - 1];
      ctx.fillStyle = 'rgba(30, 144, 255, 0.35)';
      ctx.beginPath();
      ctx.arc(end.x, end.y, 2.5, 0, Math.PI * 2);
      ctx.fill();
    }

    for (const pulse of pulses) {
      const p = pointAt(pulse.track, pulse.t);
      const near = Math.hypot(p.x - mouse.x, p.y - mouse.y) < 140;
      const r = near ? 5 : 3;
      const glow = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, r * 6);
      glow.addColorStop(0, `hsla(${pulse.hue}, 100%, 70%, 0.9)`);
      glow.addColorStop(1, `hsla(${pulse.hue}, 100%, 60%, 0)`);
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(p.x, p.y, r * 6, 0, Math.PI * 2);
      ctx.fill();
      pulse.t += pulse.speed * (near ? 2.5 : 1);
      if (pulse.t > 1) pulse.t = 0;
    }
  };

  const loop = (): void => {
    draw();
    requestAnimationFrame(loop);
  };

  resize();
  window.addEventListener('resize', resize);
  canvas.parentElement?.addEventListener('pointermove', (e) => {
    const rect = canvas.getBoundingClientRect();
    mouse.x = e.clientX - rect.left;
    mouse.y = e.clientY - rect.top;
  });

  if (prefersReducedMotion()) draw();
  else loop();
}
