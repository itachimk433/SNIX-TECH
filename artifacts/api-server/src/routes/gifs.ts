/**
 * GET /api/gifs?source=giphy&q=<query>
 *
 * Server-side proxy for GIF search — avoids CORS / origin-blocking issues in
 * the Capacitor WebView for authenticated API keys.
 * Returns: { ok: true, results: [{ url, thumb }] }
 *
 * Note: Tenor is not supported; they no longer issue public API keys.
 */
import { Router, type IRouter } from "express";
import { logger } from "../lib/logger";

const router: IRouter = Router();

// Giphy API key — set GIPHY_API_KEY env var (GitHub Secret for APK builds)
// or falls back to the project key below.
const GIPHY_KEY = process.env.GIPHY_API_KEY || "9I9AcTIdNuIIVOBptqTEkeWkNU2gII8D";

// Basic in-memory rate limiting
const WINDOW_MS   = 60_000;
const MAX_PER_IP  = 60;
interface Bucket { count: number; resetAt: number }
const gifBuckets  = new Map<string, Bucket>();
setInterval(() => {
  const now = Date.now();
  for (const [k, b] of gifBuckets) { if (now > b.resetAt) gifBuckets.delete(k); }
}, 5 * 60_000);
function gifRateLimited(ip: string): boolean {
  const now = Date.now();
  const b   = gifBuckets.get(ip);
  if (!b || now > b.resetAt) { gifBuckets.set(ip, { count: 1, resetAt: now + WINDOW_MS }); return false; }
  if (b.count >= MAX_PER_IP) return true;
  b.count++; return false;
}

interface GifResult { url: string; thumb: string }

async function searchGiphy(q: string): Promise<GifResult[]> {
  const url = `https://api.giphy.com/v1/gifs/search?api_key=${GIPHY_KEY}&q=${encodeURIComponent(q)}&limit=30&rating=pg&bundle=messaging_non_clips`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Giphy ${res.status}`);
  const j = await res.json() as { data?: any[] };
  return (j.data || []).map((g: any) => {
    const im = g.images || {};
    return { url: im.original?.url || "", thumb: im.fixed_height_downsampled?.url || im.original?.url || "" };
  }).filter((g: GifResult) => g.url);
}

router.get("/gifs", async (req, res) => {
  const ip = (req.headers["x-forwarded-for"] as string | undefined)?.split(",")[0]?.trim()
    ?? req.socket?.remoteAddress ?? "unknown";

  if (gifRateLimited(ip)) {
    res.status(429).json({ ok: false, error: "rate_limited" });
    return;
  }

  const source = String(req.query.source || "");
  const q      = String(req.query.q || "").trim().slice(0, 200);

  if (!q) { res.status(400).json({ ok: false, error: "missing_query" }); return; }
  if (source !== "giphy") {
    res.status(400).json({ ok: false, error: "unknown_source" }); return;
  }

  try {
    const results = await searchGiphy(q);
    res.json({ ok: true, results });
  } catch (err) {
    logger.warn({ err, source, q }, "gifs: upstream fetch failed");
    res.status(502).json({ ok: false, error: "upstream_failed" });
  }
});

export default router;
