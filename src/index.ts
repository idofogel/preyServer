import "dotenv/config";
import express from "express";
import cors from "cors";
import { createServer } from "http";
import { initSocket } from "./socket";
import prayersRouter from "./routes/prayers";

const PORT = Number(process.env.PORT ?? 4000);
const CLIENT_ORIGIN = process.env.CLIENT_ORIGIN ?? "http://localhost:5173";

const app = express();
app.use(cors({ origin: CLIENT_ORIGIN }));
app.use(express.json());
app.get("/check", (_req, res) => res.json({ checked: true }));
app.get("/api/health", (_req, res) => res.json({ ok: true }));
app.use("/api/prayers", prayersRouter);

const httpServer = createServer(app);
initSocket(httpServer, CLIENT_ORIGIN);

httpServer.listen(PORT, () => {
  console.log(`findMinyan server listening on http://localhost:${PORT}`);
});
