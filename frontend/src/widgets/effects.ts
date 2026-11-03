// Micro-animaciones de la portada: escritura rotativa, contadores, aparición al hacer scroll,
// inclinación 3D de tarjetas y cuenta atrás de la oferta.

const reduced = (): boolean => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

export function typewriter(el: HTMLElement, words: string[], { type = 85, erase = 45, hold = 1800 } = {}): void {
  if (reduced()) {
    el.textContent = words[0];
    return;
  }
  let word = 0;
  let chars = 0;
  let deleting = false;

  const tick = (): void => {
    const current = words[word];
    chars += deleting ? -1 : 1;
    el.textContent = current.slice(0, chars);

    let delay = deleting ? erase : type;
    if (!deleting && chars === current.length) {
      deleting = true;
      delay = hold;
    } else if (deleting && chars === 0) {
      deleting = false;
      word = (word + 1) % words.length;
      delay = 350;
    }
    window.setTimeout(tick, delay);
  };
  tick();
}

export function animateCounters(root: ParentNode = document): void {
  const els = root.querySelectorAll<HTMLElement>('[data-count]');
  const fmt = new Intl.NumberFormat('es-ES', { maximumFractionDigits: 1 });

  const run = (el: HTMLElement): void => {
    const target = Number(el.dataset.count);
    const decimals = Number(el.dataset.decimals ?? 0);
    const suffix = el.dataset.suffix ?? '';
    const duration = 1800;
    const start = performance.now();
    const step = (now: number): void => {
      const k = Math.min((now - start) / duration, 1);
      const eased = 1 - Math.pow(1 - k, 3);
      const value = target * eased;
      el.textContent = (decimals ? value.toFixed(decimals).replace('.', ',') : fmt.format(Math.round(value))) + suffix;
      if (k < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  };

  const io = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) {
          run(entry.target as HTMLElement);
          io.unobserve(entry.target);
        }
      }
    },
    { threshold: 0.5 },
  );
  els.forEach((el) => io.observe(el));
}

export function revealOnScroll(root: ParentNode = document): void {
  const els = root.querySelectorAll<HTMLElement>('[data-reveal]');
  if (reduced()) {
    els.forEach((el) => el.classList.add('is-visible'));
    return;
  }
  const io = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-visible');
          io.unobserve(entry.target);
        }
      }
    },
    { threshold: 0.15, rootMargin: '0px 0px -40px 0px' },
  );
  els.forEach((el, i) => {
    el.style.setProperty('--reveal-delay', `${(i % 4) * 90}ms`);
    io.observe(el);
  });
}

export function tilt(root: ParentNode = document, max = 8): void {
  if (reduced() || !window.matchMedia('(hover: hover)').matches) return;
  root.querySelectorAll<HTMLElement>('[data-tilt]').forEach((card) => {
    card.addEventListener('pointermove', (e) => {
      const r = card.getBoundingClientRect();
      const x = (e.clientX - r.left) / r.width - 0.5;
      const y = (e.clientY - r.top) / r.height - 0.5;
      card.style.transform = `perspective(900px) rotateX(${-y * max}deg) rotateY(${x * max}deg) translateY(-4px)`;
      card.style.setProperty('--glare-x', `${(x + 0.5) * 100}%`);
      card.style.setProperty('--glare-y', `${(y + 0.5) * 100}%`);
    });
    card.addEventListener('pointerleave', () => {
      card.style.transform = '';
    });
  });
}

/** Cuenta atrás hasta el próximo domingo a medianoche (fin de la oferta semanal). */
export function countdown(el: HTMLElement): void {
  const end = new Date();
  end.setDate(end.getDate() + ((7 - end.getDay()) % 7 || 7));
  end.setHours(23, 59, 59, 0);

  const units = {
    d: el.querySelector<HTMLElement>('[data-unit="d"]'),
    h: el.querySelector<HTMLElement>('[data-unit="h"]'),
    m: el.querySelector<HTMLElement>('[data-unit="m"]'),
    s: el.querySelector<HTMLElement>('[data-unit="s"]'),
  };
  const pad = (n: number): string => String(n).padStart(2, '0');

  const update = (): void => {
    const diff = Math.max(0, end.getTime() - Date.now());
    const s = Math.floor(diff / 1000);
    if (units.d) units.d.textContent = pad(Math.floor(s / 86400));
    if (units.h) units.h.textContent = pad(Math.floor((s % 86400) / 3600));
    if (units.m) units.m.textContent = pad(Math.floor((s % 3600) / 60));
    if (units.s) units.s.textContent = pad(s % 60);
  };
  update();
  window.setInterval(update, 1000);
}

export function stickyHeader(header: HTMLElement): void {
  const onScroll = (): void => {
    header.classList.toggle('is-scrolled', window.scrollY > 24);
  };
  onScroll();
  window.addEventListener('scroll', onScroll, { passive: true });
}

export function toast(message: string): void {
  let host = document.querySelector<HTMLElement>('.toast-host');
  if (!host) {
    host = document.createElement('div');
    host.className = 'toast-host';
    host.setAttribute('role', 'status');
    host.setAttribute('aria-live', 'polite');
    document.body.append(host);
  }
  const t = document.createElement('div');
  t.className = 'toast';
  t.textContent = message;
  host.append(t);
  window.setTimeout(() => t.classList.add('is-leaving'), 2400);
  window.setTimeout(() => t.remove(), 2800);
}
