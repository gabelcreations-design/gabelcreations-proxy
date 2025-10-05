import express from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import fetch from "node-fetch";
import dotenv from "dotenv";

dotenv.config();

const app = express();
app.use(express.json({ limit: "1mb" }));
app.use(cors({ origin: true, credentials: true }));
app.use(helmet());
app.use(rateLimit({ windowMs: 60_000, max: 60 }));

// tiny logger + ring buffer
const LOGS = [];
function logLine(level, msg, extra={}) {
  const line = { ts: Date.now(), level, msg, ...extra };
  LOGS.push(line);
  if (LOGS.length > 1000) LOGS.shift();
  console.log(`[${new Date(line.ts).toISOString()}] ${level}: ${msg}`);
}
app.use((req, res, next) => { logLine("req", `${req.method} ${req.url}`); next(); });

// health + logs + env debug
app.get("/api/health", (req, res) => res.json({ ok: true, ts: Date.now() }));
app.get("/api/logs/recent", (req,res) => {
  const total = LOGS.length;
  const limit = Math.max(1, Math.min(200, parseInt(req.query.limit ?? '50', 10)));
  const offset = Math.max(0, parseInt(req.query.offset ?? '0', 10));
  const slice = LOGS.slice(Math.max(0, total - offset - limit), total - offset);
  const hasMore = (offset + slice.length) < total;
  res.json({ logs: slice, total, hasMore });
});
app.get("/api/debug/env", (req, res) => {
  res.json({
    hasPrintify: !!process.env.PRINTIFY_TOKEN,
    hasPrintful: !!process.env.PRINTFUL_TOKEN,
    printifyShopIdSet: !!process.env.PRINTIFY_SHOP_ID,
    printfulStoreIdSet: !!process.env.PRINTFUL_STORE_ID
  });
});

// vendor bases + helper
const PRINTFUL_BASE = "https://api.printful.com";
const PRINTIFY_BASE = "https://api.printify.com/v1";

async function vendorFetch(url, options = {}) {
  const r = await fetch(url, options);
  const text = await r.text();
  try { return { status: r.status, json: JSON.parse(text) }; }
  catch { return { status: r.status, text }; }
}

// Printful passthrough
app.all("/api/printful/*", async (req, res) => {
  try {
    const token = process.env.PRINTFUL_TOKEN || "";
    if (!token) return res.status(400).json({ error: "Missing PRINTFUL_TOKEN" });

    const path = req.params[0] || "";
    const url = `${PRINTFUL_BASE}/${path}`;

    const opts = {
      method: req.method,
      headers: {
        "Authorization": `Bearer ${token}`,
        "Content-Type": "application/json",
        "Accept": "application/json"
      }
    };
    if (req.method !== "GET" && req.method !== "HEAD") {
      opts.body = JSON.stringify(req.body || {});
    }

    const out = await vendorFetch(url, opts);
    res.status(out.status).send(out.json ?? out.text);
  } catch (e) {
    logLine("error", `printful error: ${e?.message || e}`);
    res.status(500).json({ error: "proxy_printful_failed", message: String(e) });
  }
});

// Printify passthrough
app.all("/api/printify/*", async (req, res) => {
  try {
    const token = process.env.PRINTIFY_TOKEN || "";
    if (!token) return res.status(400).json({ error: "Missing PRINTIFY_TOKEN" });

    const path = req.params[0] || "";
    const url = `${PRINTIFY_BASE}/${path}`;

    const opts = {
      method: req.method,
      headers: {
        "Authorization": `Bearer ${token}`,
        "Content-Type": "application/json",
        "Accept": "application/json"
      }
    };
    if (req.method !== "GET" && req.method !== "HEAD") {
      opts.body = JSON.stringify(req.body || {});
    }

    const out = await vendorFetch(url, opts);
    res.status(out.status).send(out.json ?? out.text);
  } catch (e) {
    logLine("error", `printify error: ${e?.message || e}`);
    res.status(500).json({ error: "proxy_printify_failed", message: String(e) });
  }
});

// start
const PORT = process.env.PORT || 10000; // Render provides PORT env automatically
app.listen(PORT, () => {
  logLine("info", `✅ Secure proxy running on port ${PORT}`);
});
