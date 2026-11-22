import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";

export default defineConfig({
  root: fileURLToPath(new URL("./client", import.meta.url)),
  plugins: [react()],
  resolve: { alias: { "@shared": fileURLToPath(new URL("./shared", import.meta.url)) } },
  build: { outDir: fileURLToPath(new URL("./dist/client", import.meta.url)), emptyOutDir: true },
  test: { root: fileURLToPath(new URL(".", import.meta.url)), include: ["server/tests/**/*.test.ts"] },
} as any);
