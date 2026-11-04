// Catálogo de CompuMax organizado en las dos gamas del plan de marketing:
// Tipo B (Estándar) para familias y público general, Tipo A (Sofisticada) para usuarios exigentes.

export type Gama = 'estandar' | 'sofisticada';
export type Uso = 'ofimatica' | 'estudios' | 'creatividad' | 'gaming' | 'empresa';

export interface Product {
  id: string;
  name: string;
  gama: Gama;
  kind: 'Portátil' | 'Sobremesa';
  price: number;
  oldPrice?: number;
  image: string;
  /** object-position de la imagen */
  focus: string;
  /** 'cover' para fotos con fondo de color; por defecto se muestran enteras sobre blanco */
  fit?: 'cover';
  specs: string[];
  usos: Uso[];
  badge?: string;
  rating: number;
}

export interface GamaInfo {
  id: Gama;
  label: string;
  tipo: string;
  tagline: string;
  description: string;
  audience: string;
  bullets: string[];
  image: string;
}

export const GAMAS: Record<Gama, GamaInfo> = {
  estandar: {
    id: 'estandar',
    label: 'Gama Estándar',
    tipo: 'Tipo B',
    tagline: 'Ligero, autónomo y siempre listo',
    description: 'Equilibrio perfecto entre ligereza, autonomía y tecnología eficiente para el día a día.',
    audience: 'Familias y público general',
    bullets: [
      'Panel de 14" FHD IPS con tratamiento antirreflejos para trabajar en exteriores',
      'Chasis delgado de solo 1,4 kg y hasta 10 horas de autonomía real',
      'Intel Core i5, 16 GB de RAM y SSD ultrarrápido',
    ],
    image: '/img/gama-estandar.webp',
  },
  sofisticada: {
    id: 'sofisticada',
    label: 'Gama Sofisticada',
    tipo: 'Tipo A',
    tagline: 'No dejes que tu equipo limite tu talento',
    description:
      'Experimenta una fluidez absoluta y una potencia sin precedentes con lo último en tecnología.',
    audience: 'Profesionales y usuarios exigentes',
    bullets: [
      'Procesador de última generación AMD Ryzen 5 9600X',
      'La nueva gráfica NVIDIA GeForce RTX 5060 Ti',
      'RAM G.Skill Trident Z5 Neo RGB DDR5 a 6000 MHz y latencia CL30',
    ],
    image: '/img/gama-sofisticada.webp',
  },
};

export const PRODUCTS: Product[] = [
  {
    id: 'cmx-essential-14',
    name: 'CompuMax Essential 14',
    gama: 'estandar',
    kind: 'Portátil',
    price: 810,
    oldPrice: 869,
    image: '/img/products/essential-14.webp',
    focus: '50% 50%',
    specs: ['Intel Core i5', '16 GB RAM', 'SSD 512 GB', '14" FHD IPS antirreflejos', '1,4 kg', '10 h de autonomía'],
    usos: ['ofimatica', 'estudios'],
    badge: 'Más vendido',
    rating: 4.6,
  },
  {
    id: 'cmx-home-14',
    name: 'CompuMax Home 14',
    gama: 'estandar',
    kind: 'Portátil',
    price: 855,
    image: '/img/products/home-14.webp',
    focus: '50% 50%',
    specs: ['Intel Core i5', '16 GB RAM', 'SSD 1 TB', '14" FHD IPS antirreflejos', '1,4 kg', '10 h de autonomía'],
    usos: ['ofimatica', 'estudios', 'empresa'],
    badge: 'Ideal en casa',
    rating: 4.7,
  },
  {
    id: 'cmx-air-14-plus',
    name: 'CompuMax Air 14 Plus',
    gama: 'estandar',
    kind: 'Portátil',
    price: 900,
    image: '/img/products/air-14-plus.webp',
    focus: '50% 50%',
    fit: 'cover',
    specs: ['Intel Core i5', '16 GB RAM', 'SSD 1 TB', '14" FHD IPS antirreflejos', 'Wi-Fi 6E', '10 h de autonomía'],
    usos: ['ofimatica', 'estudios', 'empresa'],
    rating: 4.5,
  },
  {
    id: 'cmx-pro-16',
    name: 'CompuMax Pro 16',
    gama: 'sofisticada',
    kind: 'Portátil',
    price: 1100,
    image: '/img/products/pro-16.webp',
    focus: '50% 50%',
    specs: ['Ryzen 5 9600X', 'RTX 5060 Ti 8 GB', '16 GB DDR5 6000 CL30', 'SSD NVMe 1 TB'],
    usos: ['creatividad', 'empresa', 'gaming'],
    badge: 'Profesional',
    rating: 4.8,
  },
  {
    id: 'cmx-blaze-16',
    name: 'CompuMax Blaze 16',
    gama: 'sofisticada',
    kind: 'Portátil',
    price: 1260,
    oldPrice: 1349,
    image: '/img/products/blaze-16.webp',
    focus: '50% 50%',
    specs: ['Ryzen 5 9600X', 'RTX 5060 Ti 16 GB', '32 GB DDR5 6000 CL30', 'SSD NVMe 1 TB'],
    usos: ['gaming', 'creatividad'],
    rating: 4.9,
  },
  {
    id: 'cmx-titan-16',
    name: 'CompuMax Titan 16',
    gama: 'sofisticada',
    kind: 'Portátil',
    price: 1430,
    image: '/img/products/titan-16.webp',
    focus: '50% 50%',
    specs: ['Ryzen 5 9600X', 'RTX 5060 Ti 16 GB', '32 GB Trident Z5 Neo RGB', 'SSD NVMe 2 TB'],
    usos: ['gaming', 'creatividad', 'empresa'],
    badge: 'Máxima potencia',
    rating: 4.9,
  },
];

export const fromPrice = (gama: Gama): number => Math.min(...PRODUCTS.filter((p) => p.gama === gama).map((p) => p.price));

export const euro = (n: number): string =>
  new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(n);
