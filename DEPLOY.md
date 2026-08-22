# Kanairoex AI — Deployment Guide (v2.6)

Static site only. No build step. No backend.

## Quick local run

```bash
python -m http.server 8080
# → http://localhost:8080
```

## One-line hosts

| Host | How |
|------|-----|
| **Netlify** | Drag the folder onto app.netlify.com → Sites → Deploy manually |
| **Vercel** | `vercel` (from folder with index.html) or import Git repo |
| **GitHub Pages** | Push folder → Settings → Pages → Deploy from branch |
| **Cloudflare Pages** | Connect repo or direct upload; publish dir = `/` |
| **Surge** | `npx surge` |
| **Firebase** | `firebase init hosting` → public = this folder → `firebase deploy` |

## nginx snippet

```nginx
root /var/www/localmind;
index index.html;
location / { try_files $uri $uri/ /index.html; }
```

Use HTTPS (certbot). Required for reliable PWA + WebRTC.

## Rules

1. Keep the full folder structure (relative paths).
2. Serve over **HTTPS** in production.
3. After updates on shared devices:  
   `localStorage.clear(); location.reload();`
4. Entry point is always `index.html`.

## Post-deploy smoke test

```
balance
profile
My name is Ada
diagnose
p2p status
p2p turn
commands
tech status
```

## STUN / TURN (P2P across countries)

Defaults include public STUN + free TURN. For reliable Kenya ↔ USA (or any strict NAT) mobile links, point both devices at your own TURN:

```js
localStorage.setItem("localmind_ice_servers", JSON.stringify([
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "turn:your.server:3478", username: "u", credential: "p" }
]));
location.reload();
```

See **README.md** → STUN / TURN section for full notes.

Full details → see **README.md**.
