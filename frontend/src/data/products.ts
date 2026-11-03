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
  /** object-position del recorte de imagen */
  focus: string;
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
  audience: string;
  bullets: string[];
  image: string;
}

export const GAMAS: Record<Gama, GamaInfo> = {
  estandar: {
    id: 'estandar',
    label: 'Gama Estándar',
    tipo: 'Tipo B',
    tagline: 'Fiabilidad accesible para el día a día',
    audience: 'Familias y público general',
    bullets: [
      'Ordenadores fiables con rendimiento óptimo',
      'Ofimática, estudios y navegación sin complicaciones',
      'Gran relación calidad-precio',
    ],
    image: '/img/gama-estandar.webp',
  },
  sofisticada: {
    id: 'sofisticada',
    label: 'Gama Sofisticada',
    tipo: 'Tipo A',
    tagline: 'Rendimiento técnico superior, sin límites',
    audience: 'Profesionales y usuarios exigentes',
    bullets: [
      'Especificaciones técnicas superiores',
      'Máxima potencia para diseño, juegos y trabajo avanzado',
      'Tecnología de última generación',
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
    price: 449,
    oldPrice: 529,
    image: '/img/gama-estandar.webp',
    focus: '15% 50%',
    specs: ['Intel Core i3', '8 GB RAM', '256 GB SSD', '14" Full HD'],
    usos: ['ofimatica', 'estudios'],
    badge: 'Más vendido',
    rating: 4.6,
  },
  {
    id: 'cmx-home-15',
    name: 'CompuMax Home 15',
    gama: 'estandar',
    kind: 'Portátil',
    price: 599,
    image: '/img/gama-estandar.webp',
    focus: '85% 50%',
    specs: ['AMD Ryzen 5', '16 GB RAM', '512 GB SSD', '15,6" Full HD'],
    usos: ['ofimatica', 'estudios', 'empresa'],
    rating: 4.7,
  },
  {
    id: 'cmx-family-tower',
    name: 'CompuMax Family Tower',
    gama: 'estandar',
    kind: 'Sobremesa',
    price: 549,
    image: '/img/gama-estandar.webp',
    focus: '50% 50%',
    specs: ['Intel Core i5', '16 GB RAM', '1 TB SSD', 'Wi-Fi 6'],
    usos: ['ofimatica', 'estudios'],
    badge: 'Ideal en casa',
    rating: 4.5,
  },
  {
    id: 'cmx-pro-16',
    name: 'CompuMax Pro 16',
    gama: 'sofisticada',
    kind: 'Portátil',
    price: 1499,
    image: '/img/gama-sofisticada.webp',
    focus: '0% 60%',
    specs: ['Intel Core Ultra 7', '32 GB RAM', '1 TB NVMe', '16" 2.5K 165 Hz'],
    usos: ['creatividad', 'empresa'],
    badge: 'Profesional',
    rating: 4.8,
  },
  {
    id: 'cmx-blaze-17',
    name: 'CompuMax Blaze 17 RTX',
    gama: 'sofisticada',
    kind: 'Portátil',
    price: 1899,
    oldPrice: 2099,
    image: '/img/gama-sofisticada.webp',
    focus: '20% 70%',
    specs: ['Ryzen 9', 'RTX 4070', '32 GB RAM', '17,3" 240 Hz'],
    usos: ['gaming', 'creatividad'],
    rating: 4.9,
  },
  {
    id: 'cmx-titan-tower',
    name: 'CompuMax Titan Tower',
    gama: 'sofisticada',
    kind: 'Sobremesa',
    price: 2599,
    image: '/img/gama-sofisticada.webp',
    focus: '100% 40%',
    specs: ['Core i9', 'RTX 4080 Super', '64 GB DDR5', '2 TB NVMe'],
    usos: ['gaming', 'creatividad', 'empresa'],
    badge: 'Máxima potencia',
    rating: 4.9,
  },
];

export const euro = (n: number): string =>
  new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(n);
