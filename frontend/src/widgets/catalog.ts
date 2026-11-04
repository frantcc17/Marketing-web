// Selector de gamas (Estándar / Sofisticada) y rejilla de productos.

import { GAMAS, PRODUCTS, euro, fromPrice, type Gama, type Product } from '../data/products';
import type { Cart } from './cart';
import { tilt } from './effects';

const stars = (rating: number): string =>
  `<span class="stars" aria-label="${rating} de 5">★ ${rating.toString().replace('.', ',')}</span>`;

const card = (p: Product): string => `
  <article class="product" data-tilt data-gama="${p.gama}">
    ${p.badge ? `<span class="product__badge">${p.badge}</span>` : ''}
    <div class="product__media">
      <img src="${p.image}" alt="${p.name}" loading="lazy" style="object-position:${p.focus}" />
    </div>
    <div class="product__body">
      <span class="product__kind">${p.kind} · ${GAMAS[p.gama].tipo}</span>
      <h3>${p.name}</h3>
      <ul class="product__specs">${p.specs.map((s) => `<li>${s}</li>`).join('')}</ul>
      <div class="product__foot">
        <div class="price">
          ${p.oldPrice ? `<s>${euro(p.oldPrice)}</s>` : ''}
          <strong>${euro(p.price)}</strong>
        </div>
        ${stars(p.rating)}
      </div>
      <button type="button" class="btn btn--primary btn--block" data-add="${p.id}">Añadir al carrito</button>
    </div>
  </article>`;

export function mountCatalog(root: HTMLElement, cart: Cart): { show: (gama: Gama) => void } {
  const grid = root.querySelector<HTMLElement>('[data-grid]')!;
  const tabs = root.querySelectorAll<HTMLButtonElement>('[data-gama-tab]');
  const info = root.querySelector<HTMLElement>('[data-gama-info]')!;

  const show = (gama: Gama): void => {
    const g = GAMAS[gama];
    root.dataset.active = gama;
    tabs.forEach((t) => t.setAttribute('aria-selected', String(t.dataset.gamaTab === gama)));

    info.innerHTML = `
      <span class="eyebrow">${g.tipo} · ${g.audience}</span>
      <h3>${g.tagline}</h3>
      <p class="gama-info__desc">${g.description} <strong>Desde ${euro(fromPrice(gama))}</strong></p>
      <ul class="checks">${g.bullets.map((b) => `<li>${b}</li>`).join('')}</ul>`;

    grid.classList.add('is-switching');
    window.setTimeout(() => {
      grid.innerHTML = PRODUCTS.filter((p) => p.gama === gama).map(card).join('');
      tilt(grid, 6);
      grid.classList.remove('is-switching');
    }, 180);
  };

  tabs.forEach((t) => t.addEventListener('click', () => show(t.dataset.gamaTab as Gama)));

  grid.addEventListener('click', (e) => {
    const btn = (e.target as HTMLElement).closest<HTMLButtonElement>('[data-add]');
    const product = btn && PRODUCTS.find((p) => p.id === btn.dataset.add);
    if (product) cart.add(product);
  });

  show('estandar');
  return { show };
}
