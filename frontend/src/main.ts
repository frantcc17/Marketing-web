import './styles/main.css';
import type { Gama } from './data/products';
import { Cart } from './widgets/cart';
import { mountCatalog } from './widgets/catalog';
import { mountCircuitCanvas } from './widgets/circuitCanvas';
import { animateCounters, countdown, revealOnScroll, stickyHeader, tilt, typewriter } from './widgets/effects';
import { mountFinder } from './widgets/finder';

const $ = <T extends Element = HTMLElement>(sel: string): T | null => document.querySelector<T>(sel);

const cart = new Cart();
const catalogEl = $('[data-catalog]')!;
const catalog = mountCatalog(catalogEl, cart);

const goToGama = (gama: Gama): void => {
  catalog.show(gama);
  catalogEl.scrollIntoView({ behavior: 'smooth' });
};

mountCircuitCanvas($<HTMLCanvasElement>('[data-circuit]')!);
typewriter($('[data-typed]')!, ['familias', 'estudiantes', 'profesionales', 'gamers', 'creativos']);
stickyHeader($('[data-header]')!);
countdown($('[data-countdown]')!);
mountFinder($('[data-finder]')!, (gama) => goToGama(gama));

document.querySelectorAll<HTMLButtonElement>('[data-goto]').forEach((b) =>
  b.addEventListener('click', () => goToGama(b.dataset.goto as Gama)),
);

revealOnScroll();
animateCounters();
tilt();

$('[data-year]')!.textContent = String(new Date().getFullYear());
