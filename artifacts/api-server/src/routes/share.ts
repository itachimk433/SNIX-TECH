import { Router } from "express";

const router = Router();

/**
 * GET /api/share/post/:id
 *
 * Smart deep-link redirect page for shared SNIX posts.
 * On Android Chrome it fires an intent:// URI that opens the SNIX app
 * directly (no App Links / assetlinks.json required — the intent:// scheme
 * triggers the package by name). Falls back to a nice landing page with a
 * Play Store link when the app isn't installed.
 */
router.get("/share/post/:id", (req, res) => {
  const postId = req.params.id;
  if (!postId || !/^[a-zA-Z0-9_-]+$/.test(postId)) {
    res.status(400).send("Bad Request");
    return;
  }

  // Android intent:// URI — Chrome fires this automatically on page load.
  // scheme=snix  → matches <data android:scheme="snix"> in the manifest.
  // package=com.mkdev.snix → Chrome uses this to find the right app.
  // S.browser_fallback_url → where Chrome goes if the app is not installed.
  const fallbackUrl = encodeURIComponent(`https://play.google.com/store/apps/details?id=com.mkdev.snix`);
  const intentUri = `intent://post/${postId}#Intent;scheme=snix;package=com.mkdev.snix;S.browser_fallback_url=${fallbackUrl};end`;

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Open in SNIX</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      background: #020617;
      color: #f1f5f9;
      min-height: 100svh;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 24px;
      gap: 24px;
      text-align: center;
    }
    .logo {
      width: 72px;
      height: 72px;
      border-radius: 20px;
      background: linear-gradient(135deg, #2563eb, #10b981);
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 36px;
      margin: 0 auto;
    }
    h1 { font-size: 22px; font-weight: 900; letter-spacing: -0.5px; }
    p  { font-size: 14px; color: #94a3b8; line-height: 1.5; max-width: 280px; }
    .btn {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      padding: 14px 28px;
      border-radius: 16px;
      font-size: 15px;
      font-weight: 800;
      text-decoration: none;
      background: linear-gradient(135deg, #2563eb, #10b981);
      color: #fff;
      cursor: pointer;
      border: none;
      width: 100%;
      max-width: 280px;
      justify-content: center;
      letter-spacing: -0.2px;
    }
    .btn-outline {
      background: transparent;
      border: 2px solid #334155;
      color: #94a3b8;
      margin-top: 4px;
    }
    .status { font-size: 12px; color: #475569; margin-top: 8px; min-height: 18px; }
  </style>
</head>
<body>
  <div class="logo">📡</div>
  <div>
    <h1>Open in SNIX</h1>
    <p>View this VPN config in the SNIX app on your Android device.</p>
  </div>
  <div style="display:flex;flex-direction:column;align-items:center;gap:10px;width:100%">
    <a id="openBtn" class="btn" href="${intentUri}">📲 Open in SNIX</a>
    <a class="btn btn-outline" href="https://play.google.com/store/apps/details?id=com.mkdev.snix">
      Get SNIX on Play Store
    </a>
  </div>
  <p class="status" id="status"></p>
  <script>
    // On Android Chrome, immediately redirect via intent:// — Chrome handles
    // this natively, showing the app chooser or launching directly.
    const ua = navigator.userAgent || '';
    const isAndroid = /android/i.test(ua);
    const isChrome  = /Chrome\\//.test(ua) && !/Edg\\//.test(ua);
    const status = document.getElementById('status');

    if (isAndroid && isChrome) {
      status.textContent = 'Launching SNIX\u2026';
      // Small delay so the page is visible before the OS takes over
      setTimeout(() => {
        window.location.href = ${JSON.stringify(intentUri)};
      }, 400);
    }
  </script>
</body>
</html>`;

  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.send(html);
});

export default router;
