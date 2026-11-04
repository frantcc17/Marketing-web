// Carrito: estado en memoria persistido en localStorage y panel lateral.

import { PRODUCTS, euro, type Product } from '../data/products';
import { toast } from './effects';

const KEY = 'compumax:cart';

type Lines = Record<string, number>;

function load(): Lines {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? '{}') as Lines;
  } catch {
    return {};
  }
}

function save(lines: Lines): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(lines));
  } catch {
    /* almacenamiento no disponible: el carrito funciona solo en esta sesión */
  }
}

export class Cart {
  private lines: Lines = load();
  private readonly badge: HTMLElement;
  private readonly drawer: HTMLElement;
  private readonly list: HTMLElement;
  private readonly total: HTMLElement;

  constructor() {
    this.badge = document.querySelector<HTMLElement>('[data-cart-count]')!;
    this.drawer = document.querySelector<HTMLElement>('#cart-drawer')!;
    this.list = this.drawer.querySelector<HTMLElement>('[data-cart-lines]')!;
    this.total = this.drawer.querySelector<HTMLElement>('[data-cart-total]')!;

    document.querySelectorAll('[data-cart-open]').forEach((b) => b.addEventListener('click', () => this.open()));
    this.drawer.querySelectorAll('[data-cart-close]').forEach((b) => b.addEventListener('click', () => this.close()));
    document.addEventListener('keydown', (e) => e.key === 'Escape' && this.close());
    this.drawer.querySelector('[data-checkout]')?.addEventListener('click', () => {
      if (this.count() === 0) return;
      toast('¡Pedido simulado! Te contactaremos para confirmar el envío.');
      this.lines = {};
      this.render();
      this.close();
    });

    this.list.addEventListener('click', (e) => {
      const btn = (e.target as HTMLElement).closest<HTMLButtonElement>('[data-qty]');
      if (!btn) return;
      const id = btn.dataset.id!;
      this.set(id, (this.lines[id] ?? 0) + Number(btn.dataset.qty));
    });

    this.render();
  }

  add(product: Product): void {
    this.set(product.id, (this.lines[product.id] ?? 0) + 1);
    this.badge.classList.remove('is-bumped');
    void this.badge.offsetWidth; // reinicia la animación
    this.badge.classList.add('is-bumped');
    toast(`${product.name} añadido al carrito`);
  }

  private set(id: string, qty: number): void {
    if (qty <= 0) delete this.lines[id];
    else this.lines[id] = qty;
    this.render();
  }

  private count(): number {
    return Object.values(this.lines).reduce((a, b) => a + b, 0);
  }

  private render(): void {
    save(this.lines);
    const count = this.count();
    this.badge.textContent = String(count);
    this.badge.hidden = count === 0;

    const entries = Object.entries(this.lines)
      .map(([id, qty]) => ({ product: PRODUCTS.find((p) => p.id === id), qty }))
      .filter((l): l is { product: Product; qty: number } => Boolean(l.product));

    this.list.innerHTML = entries.length
      ? entries
          .map(
            ({ product, qty }) => `
        <li class="cart-line">
          <img src="${product.image}" alt="" class="${product.fit ? 'is-cover' : ''}" style="object-position:${product.focus}" />
          <div>
            <strong>${product.name}</strong>
            <span>${euro(product.price)}</span>
          </div>
          <div class="qty">
            <button type="button" data-qty="-1" data-id="${product.id}" aria-label="Quitar uno">−</button>
            <span>${qty}</span>
            <button type="button" data-qty="1" data-id="${product.id}" aria-label="Añadir uno">+</button>
          </div>
        </li>`,
          )
          .join('')
      : '<li class="cart-empty">Tu carrito está vacío. ¡Elige tu equipo hoy!</li>';

    this.total.textContent = euro(entries.reduce((sum, l) => sum + l.product.price * l.qty, 0));
  }

  open(): void {
    this.drawer.classList.add('is-open');
    this.drawer.setAttribute('aria-hidden', 'false');
  }

  close(): void {
    this.drawer.classList.remove('is-open');
    this.drawer.setAttribute('aria-hidden', 'true');
  }
}
