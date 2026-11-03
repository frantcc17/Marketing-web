// Recorta los recursos de la web a partir de los diseños originales de marca.
import sharp from 'sharp';

const crops = [
  { src: 'src/brand/logo-banner.jpg', out: 'public/img/emblem.webp', left: 440, top: 70, width: 670, height: 360 },
  { src: 'src/brand/campaign.jpg', out: 'public/img/familias.webp', left: 292, top: 250, width: 262, height: 305 },
  { src: 'src/brand/campaign.jpg', out: 'public/img/estudiantes.webp', left: 846, top: 262, width: 184, height: 290 },
  { src: 'src/brand/campaign.jpg', out: 'public/img/profesionales.webp', left: 1352, top: 262, width: 184, height: 293 },
  { src: 'src/brand/campaign.jpg', out: 'public/img/gama-estandar.webp', left: 362, top: 665, width: 365, height: 155 },
  { src: 'src/brand/campaign.jpg', out: 'public/img/gama-sofisticada.webp', left: 1136, top: 565, width: 370, height: 285 },
];

for (const c of crops) {
  await sharp(c.src)
    .extract({ left: c.left, top: c.top, width: c.width, height: c.height })
    .webp({ quality: 88 })
    .toFile(c.out);
  console.log('✔', c.out);
}
