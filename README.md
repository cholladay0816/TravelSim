# TravelSim — Secure & cheap hosting notes

This repo is a small Express server that serves a single-file frontend (`index.html`) and provides two API endpoints used by the client:

- POST `/api/chat` — forwards chat requests to OpenAI (requires `OPENAI_API_KEY`)
- POST `/api/whisper` — uploads audio files and forwards to OpenAI Whisper

Quick checklist to make this cheap and safe to host on the web:

1. Use a low-cost static host for the frontend and/or a small VPS / serverless for the API.
   - If you only need static hosting (no OpenAI integration), you can host `index.html` on GitHub Pages, Netlify, Vercel, or any static host.
   - If you need the API endpoints (OpenAI), use a small VPS (e.g., $4/mo), Render, Fly, or Railway. The server as-is is lightweight.

2. Essentials added in this branch:
   - Helmet security headers (`helmet`).
   - Rate limiting on `/api` (configurable via `RATE_LIMIT_WINDOW_MS` and `RATE_LIMIT_MAX`).
   - Optional Basic HTTP auth for `/api` (set `API_BASIC_USER` and `API_BASIC_PASS` in `.env`).
   - CORS handling with optional allow-list (`ALLOWED_ORIGINS`).

3. Recommended production settings
   - Set `API_BASIC_USER` and `API_BASIC_PASS` to protect the API from anonymous abuse.
   - Restrict `ALLOWED_ORIGINS` to your deployed frontend URL(s) (comma-separated).
   - Use HTTPS (platforms like Render/Netlify provide TLS by default).
   - Keep `OPENAI_API_KEY` secret (set in your platform's env config, never commit it).
   - Consider adding a reverse-proxy (Cloudflare) or WAF to filter traffic and rate-limit further.

4. Additional anti-spam ideas (progressively stronger):
   - Require a per-user token (short-lived JWT) issued after a simple sign-up flow.
   - Add CAPTCHA (reCAPTCHA v3) on key actions (e.g., first use or when rate limit triggered).
   - Use per-IP or per-account rate limits and adaptive throttling.
   - Block or challenge requests from TOR exit nodes or known abuse IP lists.

How to run locally

1. Copy `.env.example` to `.env` and set your values.
2. Install deps and start:

```powershell
npm install
npm start
```

The server logs the address it listens on. Open http://localhost:3000/ in a browser.

If you get CORS errors during development, set `ALLOWED_ORIGINS` to include your frontend origin (or leave empty to echo Origins).

Contact / Next steps

If you'd like, I can:
- Wire a tiny sign-in flow (username/password) and issue JWTs for API calls.
- Add a CAPTCHA protecting the `/api/chat` endpoint.
- Replace Basic auth with a short-lived token system and a minimal user table (in-memory or file-backed).
