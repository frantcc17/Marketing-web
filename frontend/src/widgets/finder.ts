// Asistente "Encuentra tu equipo": tres preguntas que llevan al cliente a la gama
// exacta que necesita (mensaje central de la campaña).

import { GAMAS, PRODUCTS, euro, type Gama, type Product, type Uso } from '../data/products';

interface Step {
  key: 'perfil' | 'uso' | 'presupuesto';
  question: string;
  options: { label: string; value: string; icon: string }[];
}

const STEPS: Step[] = [
  {
    key: 'perfil',
    question: '¿Quién va a usar el equipo?',
    options: [
      { label: 'Mi familia', value: 'familia', icon: '👨‍👩‍👧' },
      { label: 'Soy estudiante', value: 'estudiante', icon: '🎓' },
      { label: 'Soy profesional', value: 'profesional', icon: '💼' },
    ],
  },
  {
    key: 'uso',
    question: '¿Para qué lo usarás principalmente?',
    options: [
      { label: 'Ofimática y navegar', value: 'ofimatica', icon: '📄' },
      { label: 'Estudiar y clases online', value: 'estudios', icon: '📚' },
      { label: 'Diseño, vídeo, 3D', value: 'creatividad', icon: '🎨' },
      { label: 'Juegos exigentes', value: 'gaming', icon: '🎮' },
    ],
  },
  {
    key: 'presupuesto',
    question: '¿Cuál es tu presupuesto?',
    options: [
      { label: 'Hasta 600 €', value: '600', icon: '💶' },
      { label: '600 – 1.500 €', value: '1500', icon: '💳' },
      { label: 'Sin límites', value: '99999', icon: '🚀' },
    ],
  },
];

type Answers = Partial<Record<Step['key'], string>>;

function recommend(a: Answers): { gama: Gama; product: Product } {
  const uso = a.uso as Uso;
  const budget = Number(a.presupuesto);
  const exigente = uso === 'creatividad' || uso === 'gaming' || (a.perfil === 'profesional' && budget > 600);
  const gama: Gama = exigente && budget > 600 ? 'sofisticada' : 'estandar';

  const candidates = PRODUCTS.filter((p) => p.gama === gama);
  const product =
    candidates.filter((p) => p.price <= budget && p.usos.includes(uso)).sort((x, y) => y.price - x.price)[0] ??
    candidates.filter((p) => p.price <= budget).sort((x, y) => y.price - x.price)[0] ??
    candidates.sort((x, y) => x.price - y.price)[0];
  return { gama, product };
}

export function mountFinder(root: HTMLElement, onPick: (gama: Gama, product: Product) => void): void {
  let step = 0;
  const answers: Answers = {};
  const body = root.querySelector<HTMLElement>('[data-finder-body]')!;
  const bar = root.querySelector<HTMLElement>('[data-finder-progress]')!;

  const render = (): void => {
    bar.style.width = `${(step / STEPS.length) * 100}%`;

    if (step >= STEPS.length) {
      const { gama, product } = recommend(answers);
      const g = GAMAS[gama];
      body.innerHTML = `
        <div class="finder__result finder__result--${gama}">
          <img src="${product.image}" alt="" style="object-position:${product.focus}" />
          <div>
            <span class="eyebrow">Tu solución exacta · ${g.label}</span>
            <h3>${product.name}</h3>
            <p>${product.specs.join(' · ')}</p>
            <p class="finder__price">${euro(product.price)}</p>
            <div class="finder__actions">
              <button type="button" class="btn btn--primary" data-finder-pick>Ver en el catálogo</button>
              <button type="button" class="btn btn--ghost" data-finder-reset>Empezar de nuevo</button>
            </div>
          </div>
        </div>`;
      body.querySelector('[data-finder-pick]')!.addEventListener('click', () => onPick(gama, product));
      body.querySelector('[data-finder-reset]')!.addEventListener('click', () => {
        step = 0;
        render();
      });
      return;
    }

    const s = STEPS[step];
    body.innerHTML = `
      <p class="finder__step">Paso ${step + 1} de ${STEPS.length}</p>
      <h3>${s.question}</h3>
      <div class="finder__options">
        ${s.options
          .map(
            (o) => `<button type="button" class="chip" data-value="${o.value}">
                      <span aria-hidden="true">${o.icon}</span>${o.label}</button>`,
          )
          .join('')}
      </div>
      ${step > 0 ? '<button type="button" class="link-btn" data-back>← Atrás</button>' : ''}`;

    body.querySelectorAll<HTMLButtonElement>('[data-value]').forEach((b) =>
      b.addEventListener('click', () => {
        answers[s.key] = b.dataset.value;
        step++;
        render();
      }),
    );
    body.querySelector('[data-back]')?.addEventListener('click', () => {
      step--;
      render();
    });
  };

  render();
}
