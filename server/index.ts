// Servidor local (npm run dev / npm start). En Vercel no se usa: allí la API es api/index.ts.
import "dotenv/config";
import express from "express";
import { createServer } from "node:http";
import { networkInterfaces } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { nodeHandler } from "./api.js";
import { iaDisponible } from "./game/aria.js";
import { redisConfigured } from "./store.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PORT = Number(process.env.PORT) || 3000;
const isProd = process.env.NODE_ENV === "production";

const app = express();
const httpServer = createServer(app);
app.all("/api", (req, res) => void nodeHandler(req, res));

function lanIp(): string | null {
  for (const list of Object.values(networkInterfaces())) {
    for (const ni of list ?? []) if (ni.family === "IPv4" && !ni.internal && !ni.address.startsWith("169.254")) return ni.address;
  }
  return null;
}

async function start() {
  if (isProd) {
    const dist = path.join(ROOT, "dist", "client");
    app.use(express.static(dist));
    app.get("*", (_req, res) => res.sendFile(path.join(dist, "index.html")));
  } else {
    const { createServer: createVite } = await import("vite");
    const vite = await createVite({
      configFile: path.join(ROOT, "vite.config.ts"),
      server: { middlewareMode: true, hmr: { server: httpServer } },
      appType: "spa",
    });
    app.use(vite.middlewares);
  }
  httpServer.listen(PORT, "0.0.0.0", () => {
    const ip = lanIp();
    console.log("\n  Convence al algoritmo");
    console.log(`  Profesor (proyector): http://localhost:${PORT}/host`);
    if (ip) console.log(`  Alumnos en la misma wifi: http://${ip}:${PORT}/play`);
    console.log(`  ARIA: ${iaDisponible() ? `IA (${process.env.ARIA_MODEL || "claude-sonnet-5-5"})` : "motor de respaldo (sin ANTHROPIC_API_KEY)"}`);
    console.log(`  Almacenamiento: ${redisConfigured() ? "Upstash Redis" : "memoria"}\n`);
  });
}

void start();
