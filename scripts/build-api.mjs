// Empaqueta toda la API (server/api.ts y sus dependencias) en un solo archivo para la función de Vercel.
// Así la función no depende de cómo Vercel resuelva importaciones entre archivos TypeScript.
import { build } from "esbuild";

await build({
  entryPoints: ["server/vercel-entry.ts"],
  outfile: "api/_server.mjs",
  bundle: true,
  platform: "node",
  target: "node20",
  format: "esm",
  sourcemap: false,
  legalComments: "none",
  // Algunas dependencias son CommonJS y usan require(): se lo damos dentro del módulo ESM.
  banner: { js: "import { createRequire as __cr } from 'node:module'; const require = __cr(import.meta.url);" },
  logLevel: "info",
});
