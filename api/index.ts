// Función de Vercel: toda la API del juego en /api?op=...
import type { IncomingMessage, ServerResponse } from "node:http";
import { nodeHandler } from "../server/api.js";

export default function handler(req: IncomingMessage, res: ServerResponse) {
  return nodeHandler(req, res);
}
