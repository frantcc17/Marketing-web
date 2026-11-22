// Configuración del juego en un solo archivo: productos, palancas, rondas, tiempos y puntos.
// Todos los datos son ficticios.
import type { Lever, Product, RoundDef } from "../../shared/types.js";

export const RETAILER = "HiperClub";
export const CONSUMIDORA = {
  nombre: "Lucía",
  descripcion: "Lucía tiene 20 años, estudia en Madrid y hace sus compras en la app de HiperClub.",
};
export const CATEGORIA = "auriculares inalámbricos (true wireless)";

export const CONFIG = {
  prepSeconds: 180,
  extraSeconds: 30,
  maxLevers: 3,
  maxMessage: 240,
  maxPorEquipo: 3,
  puntosPorPuesto: [5, 3, 2, 1],
  penalFalsa: 2,
  penalManip: 2,
  bonusRecompra: 1,
  cuponEuros: 5,
  rondaMarcaBlanca: 3,
};

export const PRODUCTS: Product[] = [
  { id: "pulso", nombre: "Pulso Audio", corto: "Pulso", precio: 49, bateriaH: 30, anc: false, ipx: 4, reparable: false, garantiaAnios: 2, envase: "Caja de cartón reciclado", envasePlastico: false, origen: "Diseñado en Barcelona", nota: 4.3, numResenas: 140, color: "#7FB3FF" },
  { id: "bassbox", nombre: "BassBox", corto: "BassBox", precio: 39, bateriaH: 24, anc: false, ipx: 0, reparable: false, garantiaAnios: 2, envase: "Blíster de plástico", envasePlastico: true, origen: "Importado", nota: 4.1, numResenas: 86, color: "#F2C94C" },
  { id: "nebula", nombre: "Nébula Buds", corto: "Nébula", precio: 59, bateriaH: 40, anc: true, ipx: 2, reparable: false, garantiaAnios: 2, envase: "Caja de plástico", envasePlastico: true, origen: "Diseñado en Finlandia", nota: 4.0, numResenas: 60, color: "#C4A7FF" },
  { id: "ritmo", nombre: "Ritmo Verde", corto: "Ritmo Verde", precio: 55, bateriaH: 28, anc: false, ipx: 5, reparable: true, garantiaAnios: 3, envase: "Cartón sin plástico", envasePlastico: false, origen: "Ensamblado en Valencia", nota: 4.5, numResenas: 45, color: "#6FD6C0" },
  { id: "onda", nombre: "Onda Sport", corto: "Onda", precio: 69, bateriaH: 32, anc: true, ipx: 7, reparable: false, garantiaAnios: 2, envase: "Caja de cartón reciclado", envasePlastico: false, origen: "Diseñado en Bilbao", nota: 4.6, numResenas: 212, color: "#9BD36B" },
];

export const PRIVATE_LABEL: Product = {
  id: "club", nombre: "Club Selección", corto: "Club Selección", precio: 29, bateriaH: 30, anc: false, ipx: 4, reparable: false, garantiaAnios: 2, envase: "Caja de cartón reciclado", envasePlastico: false, origen: "UE", nota: 4.2, numResenas: 900, color: "#FF9A62", esMarcaBlanca: true,
};
export const PRIVATE_LABEL_MESSAGE = "La calidad de siempre al mejor precio de HiperClub";

export const LEVERS: Lever[] = [
  { id: "patrocinado", nombre: "Producto patrocinado", descripcion: "Sales arriba del catálogo con la etiqueta «Patrocinado»." },
  { id: "ficha", nombre: "Ficha enriquecida", descripcion: "ARIA lee todos tus datos: batería, ruido, agua, garantía, envase." },
  { id: "resenas", nombre: "Reseñas verificadas", descripcion: "ARIA ve tu nota media y el número de opiniones." },
  { id: "audiencia", nombre: "Audiencia Club", descripcion: "Ves una pista secreta sobre Lucía (datos del súper)." },
  { id: "banner", nombre: "Banner en portada", descripcion: "Un banner enorme en la portada de la app." },
  { id: "cupon", nombre: "Cupón en tienda", descripcion: "Baja tu precio 5 € en esta ronda." },
];

export const ROUNDS: RoundDef[] = [
  {
    numero: 1,
    nombre: "La primera compra",
    encargo: "Búscame unos auriculares inalámbricos para ir a clase.",
    pista: "Lucía pasa una hora al día en metro: quiere mucha batería y no gastar más de 50 €.",
    leccionTitulo: "Un agente no ve banners: lee datos.",
    leccion: "En el comercio agéntico pierde peso el display y ganan la ficha enriquecida, las reseñas y los datos propios del retailer.",
  },
  {
    numero: 2,
    nombre: "ARIA aprende de Lucía",
    encargo: "Lo de siempre, pero que me sirvan para mi rutina nueva.",
    pista: "Lucía ha empezado a correr: necesita resistencia al sudor y al agua (IPX4 o más) y valora que sean reparables.",
    leccionTitulo: "Los datos propios valen oro.",
    leccion: "Quien tenía la pista del Club sabía qué contar. Es la ventaja del first-party data y de la segmentación con datos de compra.",
  },
  {
    numero: 3,
    nombre: "El súper juega en casa",
    encargo: "Necesito otros iguales de buenos para regalárselos a mi hermano.",
    pista: "Lucía es fiel: si una marca le ha convencido, prefiere repetirla, salvo que cueste más de 20 € que la alternativa más barata.",
    leccionTitulo: "El retailer es medio, vendedor y competidor.",
    leccion: "Su marca blanca entra con posición patrocinada gratis y datos completos. La fidelización es la mejor defensa.",
  },
];

export interface Preferencias {
  precio: number;
  bateria: number;
  ipx: number;
  reparable: number;
  anc: number;
  presupuestoMax: number | null;
  fidelidad: number;
  umbralFidelidad: number;
}

// Pesos del motor de respaldo por ronda (solo se aplican a datos visibles).
export const PREFERENCIAS: Preferencias[] = [
  { precio: 2, bateria: 3, ipx: 0, reparable: 0, anc: 0.5, presupuestoMax: 50, fidelidad: 0, umbralFidelidad: 0 },
  { precio: 1, bateria: 0.5, ipx: 3, reparable: 2, anc: 0, presupuestoMax: null, fidelidad: 0, umbralFidelidad: 0 },
  { precio: 2.5, bateria: 1, ipx: 1, reparable: 0.5, anc: 0.5, presupuestoMax: null, fidelidad: 4, umbralFidelidad: 20 },
];

export const ROOM_WORDS = ["BUDS", "BEAT", "ONDA", "BASS", "RITMO"];

export function hasPrivateLabel(roundIndex: number): boolean {
  return roundIndex + 1 >= CONFIG.rondaMarcaBlanca;
}

export function productById(id: string): Product | undefined {
  return [...PRODUCTS, PRIVATE_LABEL].find((p) => p.id === id);
}
