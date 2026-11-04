// Sustituye los logos de fabricante de las fotos de producto por el emblema de CompuMax.
// Uso: node scripts/brand-products.mjs  (lee src/brand/products/raw-*.png, escribe public/img/products/*.webp)
import { mkdir } from 'node:fs/promises';
import sharp from 'sharp';

const SRC = 'src/brand/products';
const OUT = 'public/img/products';

// Zonas a borrar: `box` [x0, y0, x1, y1] en píxeles; `whitish` borra solo los píxeles claros
// y poco saturados dentro de la caja (para logos detrás de otros elementos).
// Emblemas: centro (cx, cy), ancho w y variante clara/oscura según el fondo.
const JOBS = [
  {
    file: 'raw-3.png', out: 'blaze-16.webp',
    erase: [{ box: [98, 79, 143, 131] }, { box: [107, 159, 133, 170] }],
    logos: [{ cx: 120, cy: 105, w: 52, tone: 'light' }, { cx: 120, cy: 164.5, w: 18, tone: 'light' }],
  },
  {
    file: 'raw-4.png', out: 'pro-16.webp',
    erase: [{ box: [186, 18, 214, 36] }, { box: [102, 28, 142, 66], whitish: true }, { box: [115, 150, 125, 158] }],
    logos: [{ cx: 200, cy: 27, w: 34, tone: 'light' }, { cx: 120, cy: 154, w: 14, tone: 'dark' }],
  },
  {
    file: 'raw-5.png', out: 'titan-16.webp',
    erase: [{ box: [264, 12, 336, 86] }, { box: [248, 164, 327, 186] }, { box: [178, 223, 197, 237] }],
    logos: [{ cx: 300, cy: 49, w: 74, tone: 'light' }, { cx: 187.5, cy: 230, w: 20, tone: 'light' }],
  },
  {
    file: 'raw-6.png', out: 'essential-14.webp',
    erase: [{ box: [215, 270, 233, 287] }],
    logos: [{ cx: 224, cy: 278.5, w: 24, tone: 'light' }],
  },
  {
    file: 'raw-7.png', out: 'home-14.webp',
    erase: [{ box: [181, 215, 196, 231] }, { box: [347, 286, 363, 324] }],
    logos: [{ cx: 188.5, cy: 223, w: 20, tone: 'light' }],
  },
  {
    file: 'raw-8.png', out: 'air-14-plus.webp',
    erase: [{ box: [243, 309, 262, 318] }, { box: [310, 333, 327, 360] }],
    logos: [{ cx: 252.5, cy: 313, w: 15, tone: 'dark' }],
  },
];

/** Emblema con alfa derivado de la luminancia (el original está sobre negro). */
async function buildEmblems() {
  const { data, info } = await sharp('public/img/emblem.webp').ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const light = Buffer.from(data);
  const dark = Buffer.from(data);
  for (let i = 0; i < data.length; i += 4) {
    const lum = (0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2]) / 255;
    const a = Math.max(0, Math.min(1, (lum - 0.1) / 0.45));
    light[i + 3] = dark[i + 3] = Math.round(a * 255);
    // Variante oscura para chasis claros: tono grafito con un toque azul.
    dark[i] = Math.round(data[i] * 0.28);
    dark[i + 1] = Math.round(data[i + 1] * 0.3);
    dark[i + 2] = Math.round(data[i + 2] * 0.38);
  }
  const make = (buf) =>
    sharp(buf, { raw: { width: info.width, height: info.height, channels: 4 } }).trim({ threshold: 10 }).png().toBuffer();
  return { light: await make(light), dark: await make(dark) };
}

/** Rellena los píxeles enmascarados promediando vecinos hasta converger (inpainting por difusión). */
function inpaint(px, width, height, region) {
  const [x0, y0, x1, y1] = region.box;
  const mask = new Uint8Array(width * height);
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const i = (y * width + x) * 3;
      const r = px[i], g = px[i + 1], b = px[i + 2];
      const max = Math.max(r, g, b), min = Math.min(r, g, b);
      const whitish = max > 150 && (max - min) / (max || 1) < 0.28;
      if (!region.whitish || whitish) mask[y * width + x] = 1;
    }
  }
  if (region.whitish) {
    // Dilata la máscara un píxel para eliminar el halo antialiasado del logo.
    const grown = mask.slice();
    for (let y = y0; y <= y1; y++)
      for (let x = x0; x <= x1; x++)
        if (mask[y * width + x])
          for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) grown[(y + dy) * width + x + dx] = 1;
    mask.set(grown);
  }
  for (let iter = 0; iter < 400; iter++) {
    for (let y = y0 - 1; y <= y1 + 1; y++) {
      for (let x = x0 - 1; x <= x1 + 1; x++) {
        if (!mask[y * width + x]) continue;
        for (let c = 0; c < 3; c++) {
          let sum = 0, n = 0;
          for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
            const nx = x + dx, ny = y + dy;
            if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
            sum += px[(ny * width + nx) * 3 + c];
            n++;
          }
          px[(y * width + x) * 3 + c] = sum / n;
        }
      }
    }
  }
}

const emblems = await buildEmblems();
await mkdir(OUT, { recursive: true });

for (const job of JOBS) {
  const { data, info } = await sharp(`${SRC}/${job.file}`).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const px = Float32Array.from(data);
  for (const region of job.erase) inpaint(px, info.width, info.height, region);

  const overlays = [];
  for (const logo of job.logos) {
    const img = sharp(emblems[logo.tone]).resize({ width: logo.w });
    const meta = await img.clone().png().toBuffer({ resolveWithObject: true });
    overlays.push({
      input: meta.data,
      left: Math.round(logo.cx - meta.info.width / 2),
      top: Math.round(logo.cy - meta.info.height / 2),
    });
  }

  await sharp(Buffer.from(Uint8Array.from(px, (v) => Math.round(v))), {
    raw: { width: info.width, height: info.height, channels: 3 },
  })
    .composite(overlays)
    .webp({ quality: 92 })
    .toFile(`${OUT}/${job.out}`);
  console.log('✔', `${OUT}/${job.out}`);
}
