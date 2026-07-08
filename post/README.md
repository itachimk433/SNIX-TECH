# SNIX Share Link Bridge

Static files deployed via **Cloudflare Pages** at `https://snixapp.pages.dev`.

## Files

```
index.html        — Root landing page (snixapp.pages.dev/)
post/index.html   — Post detail page (snixapp.pages.dev/post/<id>)
_redirects        — Routes /post/* to post/index.html (Cloudflare Pages)
```

## Cloudflare Pages setup

1. Connect this repo to Cloudflare Pages.
2. Leave **Build command** blank (static site, no build step).
3. Set **Build output directory** to `/` (repo root).
4. Project name → `snixapp` → URL will be `snixapp.pages.dev`.
5. Deploy.

## How share links work

SNIX generates links like `https://snixapp.pages.dev/post/abc123`.

The `post/index.html` page reads the post ID from the URL path and:
- Tries to open `snix://post/<id>` (deep link into the native app)
- Falls back to a Google Play download button if the app isn't installed
