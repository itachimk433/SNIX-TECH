import { Router, type IRouter } from "express";
import { z } from "zod";
import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb } from "../lib/firebaseAdmin";
import { logger } from "../lib/logger";

const router: IRouter = Router();

// ── Simple in-memory IP rate limiter ───────────────────────────────────────
// Allows up to 120 requests per IP per minute (2/s average).
// This is intentionally lightweight — no Redis dependency.
const WINDOW_MS  = 60_000;
const MAX_PER_IP = 120;

interface RateBucket { count: number; resetAt: number }
const ipBuckets = new Map<string, RateBucket>();

// Prune old entries every 5 minutes to avoid unbounded growth
setInterval(() => {
  const now = Date.now();
  for (const [ip, b] of ipBuckets) {
    if (now > b.resetAt) ipBuckets.delete(ip);
  }
}, 5 * 60_000);

function isRateLimited(ip: string): boolean {
  const now = Date.now();
  let b = ipBuckets.get(ip);
  if (!b || now > b.resetAt) {
    ipBuckets.set(ip, { count: 1, resetAt: now + WINDOW_MS });
    return false;
  }
  if (b.count >= MAX_PER_IP) return true;
  b.count++;
  return false;
}

// ── Schema ──────────────────────────────────────────────────────────────────
const TrackSchema = z.object({
  postId: z.string().min(1).max(128).regex(/^[a-zA-Z0-9_-]+$/),
  action: z.enum(["view", "download", "copy"]),
});

/**
 * POST /api/track
 * Increments a post stat counter via the Admin SDK (bypasses Firestore security
 * rules) so guest users can contribute counts without a flicker/revert.
 * Rate-limited to 120 req/IP/min to prevent scripted counter inflation.
 * Body: { postId: string, action: "view" | "download" | "copy" }
 */
router.post("/track", async (req, res) => {
  const ip = (req.headers["x-forwarded-for"] as string | undefined)?.split(",")[0]?.trim()
    ?? req.socket?.remoteAddress
    ?? "unknown";

  if (isRateLimited(ip)) {
    res.status(429).json({ ok: false, error: "rate_limited" });
    return;
  }

  const parsed = TrackSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ ok: false, error: "invalid_request" });
    return;
  }

  const db = getAdminDb();
  if (!db) {
    // SDK not configured — swallow silently so client doesn't error
    res.json({ ok: false, error: "db_not_configured" });
    return;
  }

  const { postId, action } = parsed.data;
  // view → viewCount + guestViewCount; download/copy → downloadCount + guestDownloadCount
  const update = action === "view"
    ? { viewCount: FieldValue.increment(1), guestViewCount: FieldValue.increment(1) }
    : { downloadCount: FieldValue.increment(1), guestDownloadCount: FieldValue.increment(1) };

  try {
    await db.collection("posts").doc(postId).update(update);
    res.json({ ok: true });
  } catch (err) {
    logger.warn({ err, postId, action }, "track: Firestore update failed");
    res.status(500).json({ ok: false, error: "update_failed" });
  }
});

export default router;
