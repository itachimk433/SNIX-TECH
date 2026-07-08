import { Router, type IRouter } from "express";
import { z } from "zod";
import { sendPushToUser, isPushEnabled } from "../lib/firebaseAdmin";

const router: IRouter = Router();

const SendPushSchema = z.object({
  targetUserId: z.string().min(1),
  title: z.string().min(1).max(120),
  body: z.string().min(1).max(500),
  data: z.record(z.string(), z.string()).optional(),
});

router.post("/push/send", async (req, res) => {
  if (!isPushEnabled()) {
    res.status(503).json({ ok: false, error: "push_not_configured" });
    return;
  }

  const parsed = SendPushSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ ok: false, error: "invalid_request" });
    return;
  }

  const result = await sendPushToUser(parsed.data);
  res.status(result.ok ? 200 : 200).json(result);
});

export default router;
