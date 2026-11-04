# CompuMax · Web

Tienda de ordenadores CompuMax (Vite + TypeScript, sin frameworks).

```bash
npm install
npm run dev      # desarrollo en http://localhost:5173
npm run build    # comprobación de tipos + build en dist/
npm run assets   # regenera public/img a partir de src/brand/*.jpg
npm run brand    # pone el logo CompuMax en las fotos de src/brand/products → public/img/products
```

- `index.html` – tienda: hero animado, perfiles, selector de gamas, asistente de compra, oferta y carrito.
- `estrategia.html` – plan publicitario interno (objetivos, públicos, presupuesto por trimestre, mensaje).
- `src/data/` – catálogo (`products.ts`) y plan de marketing (`strategy.ts`).
- `src/widgets/` – componentes de la portada.
