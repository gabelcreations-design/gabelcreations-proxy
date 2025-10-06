import express from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import fetch from "node-fetch";
import dotenv from "dotenv";

dotenv.config();

const app = express();
app.use(express.json({ limit: "2mb" }));
app.use(cors({ origin: true, credentials: true }));
app.use(helmet());
app.use(rateLimit({ windowMs: 60_000, max: 120 }));

// tiny logs + health
app.get("/api/health", (_req, res) => res.json({ ok: true, ts: Date.now() }));

// env debug (lets you see if tokens are loaded)
app.get("/api/debug/env", (_req, res) => {
  res.json({
    hasPrintful: !!process.env.PRINTFUL_TOKEN
  });
});

// Printful passthrough (enough to prove live)
const PRINTFUL_BASE = "https://api.printful.com";
async function passthrough(req, res, base, token) {
  if (!token) return res.status(400).json({ error: "Missing PRINTFUL_TOKEN" });
  const path = req.params[0] || "";
  const url = `${base}/${path}`;
  const opts = {
    method: req.method,
    headers: {
      "Authorization": `Bearer ${token}`,
      "Content-Type": "application/json",
      "Accept": "application/json"
    }
  };
  if (!["GET","HEAD"].includes(req.method)) {
    opts.body = JSON.stringify(req.body || {});
  }
  const r = await fetch(url, opts);
  const text = await r.text();
  try { return res.status(r.status).json(JSON.parse(text)); }
  catch { return res.status(r.status).send(text); }
}

app.all("/api/printful/*", (req, res) =>
  passthrough(req, res, PRINTFUL_BASE, process.env.PRINTFUL_TOKEN)
);

// start (Render injects PORT)
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`✅ Proxy running on ${PORT}`));
