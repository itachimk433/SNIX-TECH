<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>SNIX — The Decentralized VPN Hub</title>
  <meta name="description" content="Browse and share VPN configs on SNIX." />
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      background: #020617;
      color: #f8fafc;
      min-height: 100vh;
      display: flex; flex-direction: column; align-items: center; justify-content: center;
      padding: 2rem;
      text-align: center;
    }
    .icon {
      width: 80px; height: 80px; border-radius: 24px; overflow: hidden;
      box-shadow: 0 0 60px rgba(37,99,235,0.4);
      margin: 0 auto 1.5rem;
      background: linear-gradient(135deg, #2563eb, #10b981);
      display: flex; align-items: center; justify-content: center;
      font-size: 2.5rem; font-weight: 900; color: #fff;
    }
    h1 { font-size: 2.5rem; font-weight: 900; letter-spacing: -1px; margin-bottom: .25rem; }
    .sub { color: #64748b; font-size: .85rem; margin-bottom: 2.5rem; }
    .btn {
      display: inline-flex; align-items: center; gap: .5rem;
      padding: .85rem 2rem; border-radius: 14px; font-weight: 700;
      font-size: .85rem; letter-spacing: .05em; text-transform: uppercase;
      text-decoration: none; transition: opacity .15s;
      margin: .35rem auto; width: 100%; max-width: 280px; justify-content: center;
    }
    .btn:hover { opacity: .85; }
    .btn-primary { background: linear-gradient(135deg, #2563eb, #10b981); color: #fff; }
    .btn-secondary { background: #1e293b; color: #cbd5e1; border: 1px solid #334155; }
    .divider { color: #334155; font-size: .7rem; letter-spacing: .1em; text-transform: uppercase; margin: 1rem 0; }
  </style>
</head>
<body>
  <div class="icon">S</div>
  <h1>SNIX</h1>
  <p class="sub">The Decentralized VPN Configuration Hub</p>
  <a href="https://play.google.com/store/apps/details?id=com.mkdev.snix" class="btn btn-primary">
    📱 Download SNIX for Android
  </a>
  <div class="divider">already installed?</div>
  <a href="snix://feed" class="btn btn-secondary">Open SNIX App</a>
</body>
</html>
