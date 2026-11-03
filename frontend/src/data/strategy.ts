// Plan publicitario de CompuMax: 20 trimestres de operación.
// Las cifras siguen las reglas del plan (arranque 30–40 k€, picos de 200 k€,
// recorte a 150 k€ en la contracción y consolidación por encima de 650 k€).

export type Phase = 'introduccion' | 'expansion' | 'correccion' | 'consolidacion';

export interface Quarter {
  q: number;
  budget: number;
  phase: Phase;
}

export const PHASES: Record<Phase, { label: string; color: string; note: string }> = {
  introduccion: { label: 'Introducción', color: '#5b8cff', note: 'Presupuesto moderado para dar a conocer la marca.' },
  expansion: { label: 'Expansión', color: '#1e90ff', note: 'Fuertes inyecciones para ganar cuota rápidamente.' },
  correccion: { label: 'Corrección', color: '#8a94a6', note: 'Recorte estratégico para estabilizar beneficios.' },
  consolidacion: { label: 'Nueva expansión', color: '#a855f7', note: 'Escalado agresivo acompañando el crecimiento del mercado.' },
};

const BUDGETS: [number, Phase][] = [
  [30_000, 'introduccion'],
  [35_000, 'introduccion'],
  [40_000, 'introduccion'],
  [90_000, 'expansion'],
  [150_000, 'expansion'],
  [200_000, 'expansion'],
  [200_000, 'expansion'],
  [150_000, 'correccion'],
  [150_000, 'correccion'],
  [150_000, 'correccion'],
  [230_000, 'consolidacion'],
  [300_000, 'consolidacion'],
  [360_000, 'consolidacion'],
  [420_000, 'consolidacion'],
  [480_000, 'consolidacion'],
  [530_000, 'consolidacion'],
  [580_000, 'consolidacion'],
  [620_000, 'consolidacion'],
  [660_000, 'consolidacion'],
  [700_000, 'consolidacion'],
];

export const QUARTERS: Quarter[] = BUDGETS.map(([budget, phase], i) => ({ q: i + 1, budget, phase }));

export const LEADERSHIP_GOAL = 10;

export const OBJECTIVES = [
  {
    icon: 'trophy',
    title: 'Superar a Alfa y Omega',
    text: 'Liderar las ventas del mercado en al menos 10 de los 20 trimestres de operación.',
  },
  {
    icon: 'chart',
    title: 'Captar cuota de mercado',
    text: 'Incrementos agresivos de inversión publicitaria durante las fases de expansión económica.',
  },
  {
    icon: 'growth',
    title: 'Expansión rentable',
    text: 'Que el aumento sostenido del gasto acompañe una mejora de márgenes y de cuota global.',
  },
];
