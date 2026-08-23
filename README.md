# Kanairoex AI — Complete Guide

> **Current build: v39 — image-search/CORS fallback and service-worker cache and browser research fallback fix.** The recommended test command is `look up image of Jesus`. The image pipeline now has Openverse, Wikimedia fetch, Wikimedia JSONP, Wikipedia thumbnail, and direct Commons fallback paths. See `DEBUG-REPORT.md` for the repair analysis and test results.

Private **offline-first** study AI that runs entirely in your browser. No account required. Your knowledge, wallet, profile photo/video, and chat history stay on **this device** (localStorage + IndexedDB). Optional **WebRTC P2P** lets you chat, send files, share your profile, and transfer educational **LMT** tokens between browsers.

**LMT is educational only — not real cryptocurrency.**

---

## Table of contents

1. [Quick start & deployment](#1-quick-start--deployment)
2. [Chat basics](#2-chat-basics)
3. [Profile (name, photo, video, bio)](#3-profile-name-photo-video-bio)
4. [Share profile over P2P](#4-share-profile-over-p2p)
5. [Wallet & LMT tokens](#5-wallet--lmt-tokens)
6. [Create tokens, pools, swaps](#6-create-tokens-pools-swaps)
7. [P2P connection (WebRTC)](#7-p2p-connection-webrtc)
8. [Knowledge, teach, memory chain](#8-knowledge-teach-memory-chain)
10. [Online lookup, GitHub code & reference research](#10-online-lookup-github-code--reference-research)
11. [AI Lab, local LLM, multimodal](#11-ai-lab-local-llm-multimodal)
12. [Tools (math, code, CSV plot, …)](#12-tools-math-code-csv-plot-)
13. [Panels in the sidebar](#13-panels-in-the-sidebar)
14. [Privacy & limits](#14-privacy--limits)
15. [Troubleshooting](#15-troubleshooting)

---

## 1. Quick start & deployment

### Local

```bash
# From the folder that contains index.html
python -m http.server 8080
# open http://localhost:8080
```

Do **not** open `index.html` via `file://` if you need PWA, service worker, or WebRTC.

### Deploy (static host — no build step)

| Host | How |
|------|-----|
| Netlify | Drag the whole folder → Deploy manually |
| Vercel | `vercel` from the folder, or import Git |
| GitHub Pages | Push so `index.html` is at repo root (or `/docs`) |
| Cloudflare Pages | Upload / connect repo; publish directory = `/` |
| nginx / Apache | Document root = folder with `index.html`; use **HTTPS** |

Keep the full folder structure (relative script paths). After updates on a shared device:

```js
localStorage.clear(); location.reload();
```

### Smoke test after deploy

```
My name is Ada
balance
profile
tech status
```

---

## 2. Chat basics

Type in the message box and send. Examples:

| You type | What happens |
|----------|----------------|
| `Remember that Nairobi is the capital of Kenya` | Saves a fact into knowledge |
| `What is the capital of Kenya?` | Answers from knowledge / offline pages |
| `2 + 2 * 3` | Math (BODMAS) |
| `look up Photosynthesis` | Online fetch (when online) → stored offline |
| `balance` | Wallet + **💎 LMT** symbol |
| `My name is Sam` | Saves your name for later replies |

Chips under the welcome message are shortcuts (same as typing the command).

---

## 3. Profile (name, photo, video, bio)

Kanairoex remembers **who you are** on this device — not only your name.

| Command | Action |
|---------|--------|
| `My name is Ada` / `Call me Ada` / `I am Ada` | Save name |
| `What is my name?` | Recall name |
| `set bio Student & builder in Nairobi` | Save short bio (≤ 280 chars) |
| `profile` / `my profile` / `who am i` | Show profile; shows photo if saved |
| `set photo` / `this is my photo` | Opens file picker → compresses & stores image |
| `set video` / `this is my video` | Opens file picker → stores short video (size-limited) |
| `clear photo` / `clear video` | Remove media |
| `share profile` / `p2p profile` | Send profile to connected P2P peer |
| `peer profiles` | List profiles received from peers |
| `peer profile Ada` or `peer profile LMT-XXXX` | View one peer (with photo if they sent it) |

**Storage**

- Name + bio → `localStorage`
- Photo → resized JPEG in **IndexedDB** (fallback: small image in localStorage)
- Video → IndexedDB only; keep clips short (large files → use `p2p file` instead)

Your wallet address (if the LMT wallet is loaded) is included when you share.

---

## 4. Share profile over P2P

1. Connect two devices with [P2P setup](#7-p2p-connection-webrtc) until `p2p status` shows channel **open**.
2. On your device: `share profile` (or `p2p profile`).
3. Peer sees a **Peer profile received** message (name, bio, wallet, photo if included).
4. Peer can later run `peer profiles` or `peer profile YourName`.

Optional: send a larger video or any file with `p2p file` after sharing the profile card.

---

## 5. Wallet & LMT tokens

**Symbol:** 💎 **LMT** (Kanairoex Token)  
**Genesis balance:** 1 LMT · **Question reward:** 0.001 LMT  
**Simulated price:** starts ~0.001 USD, +0.05%/day (display only)

| Command | Meaning |
|---------|---------|
| `balance` / `wallet` / `show balance` | Address, **💎 LMT** balance, portfolio USD |
| `wallet password` | Set Sudoku-derived password (hash only stored) |
| `wallet unlock` / `wallet solve …` | Unlock session (~15 min) |
| `wallet lock` | Lock now |
| `pay 20 LMT-ABCD1234` | Local ledger transfer |
| `p2p pay 20 LMT-ABCD1234` | P2P transfer (queues in **outbox** if offline) |
| `outbox` / `flush outbox` | View / retry queued transfers |
| `lmt history` | Recent txs |
| `lmt faucet` | Small demo top-up (if enabled) |
| `lmt price` | Simulated price + FX anchors |
| `convert 5 usd` | Educational LMT → fiat bucket |
| `explorer` | Local explorer (this device) |
| `export wallet 1 2 … 16` | Backup string for another device |
| `import wallet <blob> 1 2 … 16` | Restore |

You can only send to an **LMT-…** address. Incoming P2P credit applies only if `to` matches the receiver’s address.

---

## 6. Create tokens, pools, swaps

| Command | Example |
|---------|---------|
| Create token (emoji required) | `create token MYT MyToken 1000000 0.01 🚀` |
| Token / pool stats | `token MYT` · `pool MYT` · `markets` |
| Swap | `swap 100 LMT MYT` · `swap 50 MYT LMT` |
| Add liquidity | `add liquidity 100 LMT MYT 90000` |
| Remove liquidity | `remove liquidity MYT 10` |
| LP position | `lp MYT` |
| Sync pools (P2P / URL) | `sync pools` · `pool sync url …` |

Create fee (default **10,000 LMT**) seeds the liquidity pool. Initial pool price is seeded near the USD price you pass so markets stay reasonable.

---

## 7. P2P connection (WebRTC)

| Command | Meaning |
|---------|---------|
| `p2p setup` | Step-by-step guide |
| `p2p status` / `webrtc status` | Channel / ICE state |
| `p2p offer` | Device A creates offer (copy JSON) |
| `p2p answer <json>` | Device B answers / A accepts answer |
| `p2p send Hello` / `p2p msg Hello` | Text chat |
| `p2p file` | Send any file (image/video/doc) |
| `p2p pay 5 LMT-XXXX` | Token over data channel |
| `share profile` | Profile card (+ photo) |
| `p2p knowledge` | Share recent facts |
| `tech status` / `advanced status` | Feature matrix |

### Connect in 3 steps

1. **A:** `p2p offer` → wait → copy the JSON  
2. **B:** `p2p answer` + paste A’s JSON → copy B’s answer  
3. **A:** `p2p answer` + paste B’s answer → `p2p status` → **open**

Both devices must be online at the same time. Long-distance is fine; strict NATs may need TURN (see below).

### STUN / TURN

Defaults include public STUN (+ optional free TURN). For reliable mobile links, set your own TURN on **both** devices:

```js
localStorage.setItem("localmind_ice_servers", JSON.stringify([
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "turn:your.server:3478", username: "u", credential: "p" }
]));
location.reload();
```

---

## 8. Knowledge, teach, memory chain

| Action | How |
|--------|-----|
| Teach a fact | `Remember that …` or use the **Teach** panel |
| Ask | Normal questions in chat |
| Correct | `Correct: subject is …` / verify commands |
| Knowledge panel | Browse / search saved facts |
| Memory chain | Blockchain-style hashed blocks of interactions (**Memory Chain** panel) |
| Neurons | Association strengths that grow with use |
| Cognitive engine | Working memory + knowledge graph (when loaded) |
| Clear all | Top bar **Clear** (wipes local memory — careful) |

---


**Removed.** Use `diagnose`, `p2p status`, `tech status`, and `balance` instead.


## 10. Online lookup & offline pages

When the browser is online:

| Command | Result |
|---------|--------|
| `look up Topic` | Fetch + store offline |
| `search online for Topic` | Web-oriented fetch |
| `fetch url https://…` | Save a page |
| Offline pages list | `offline pages` / related phrases |

Later, offline, Kanairoex can answer from **saved pages** (keyword match). Prefer teaching important facts with `Remember that …` for higher quality.

---

## 11. AI Lab, local LLM, multimodal

Open **🧠 AI Lab** in the sidebar.

- **External backends:** Ollama, LM Studio, llama.cpp (localhost) — probe, select model, chat  
- **WebLLM (in-browser):** needs WebGPU; load a small model when available  
- **Multimodal:** image caption / VQA when models are loaded  
- **Offline AI suite:** local documents / agent helpers  

Chat routing may prefer a loaded local LLM for open-ended questions; classic knowledge still works offline without a model.

---

## 12. Tools (math, code, CSV plot, …)

Examples:

| Command / pattern | Feature |
|-------------------|---------|
| Arithmetic / algebra-ish text | `MathEngine` |
| `plot csv:` + CSV text | Simple line chart image |
| Code / sandbox tools | Safe JS run (when registered) |
| Writer / summarizer / quiz | Study helpers |
| Voice | Speech input where the browser allows |
| UTM / geo tools | When V4 tools are registered |

---

## 13. Panels in the sidebar

| Panel | Purpose |
|-------|---------|
| 💬 Chat | Main interface |
| 📚 Knowledge | Facts you taught |
| ⛓️ Memory Chain | Hashed interaction blocks |
| 🎓 Teach | Guided teaching |
| 🧠 AI Lab | Local / external models, diagnostics |
| ⚙️ Settings | Theme, university notes, options |


---



---

## Study Hub (SRS, streak, pins, backup)

| Command | What it does |
|---------|----------------|
| `review` | Next due flashcard |
| `show answer` | Reveal answer |
| `again` / `hard` / `good` / `easy` | Grade current card |
| `add card Front \| Back` | Manual card |
| `cards from knowledge` | Turn recent facts into cards |
| `lessons` / `lesson kenya-basics` | Built-in lesson packs |
| `streak` | Daily streak + counts |
| `pin this: …` / `pins` | Bookmark text |
| `alert LMT above 0.002` | Local price alert |
| `diagnose` | System health |
| `backup` / `export profile` | JSON download |
| `commands` | Command palette |
| `explain simple: …` | Simpler wording |
| `contradictions` | Possible knowledge conflicts |
| `checklist` | Onboarding checklist |

Quiz correct answers can grant a tiny 💎 LMT reward when the wallet is available.




## DID & DWN (identity + personal data vault)

| Command | Action |
|---------|--------|
| `did create` | Create `did:jwk` (P-256) on this device |
| `did show` | Show your DID |
| `did export` | Download key backup (keep private) |
| `dwn status` | Local DWN record counts |
| `dwn write profile` | Store signed profile record |
| `dwn share profile` | Send signed profile over P2P |
| `dwn send chat Hello` | Signed chat via DWN + P2P |
| `dwn query chat` | List chat records |

P2P file / image / video (`p2p file`) and token pays store **DWN receipts** when a DID exists. Messages are signed so peers can verify the sender.


## 14. Privacy & limits

| Topic | Reality |
|-------|---------|
| Data location | On-device (localStorage, IndexedDB, OPFS when available) |
| Cloud account | None required |
| LMT | Simulated educational token — **not** bank money or listed crypto |
| P2P | Direct browser-to-browser; no Kanairoex relay server |
| Store-and-forward if peer offline | Outbox on sender only — peer must connect later and flush |
| Profile video size | Capped; large videos → `p2p file` |
| Cross-origin fetch | Subject to browser CORS |

---

## 15. Troubleshooting

| Symptom | Try |
|---------|-----|
| Balance has no 💎 LMT | Hard refresh; confirm you deployed the latest files |
| P2P never opens | Both online; complete offer/answer; try TURN; HTTPS |
| Profile photo fails | Smaller image; allow IndexedDB; free site storage |
| Share profile fails | `p2p status` must show channel **open** |
| Stale UI after update | `localStorage.clear(); location.reload();` |
| `file://` quirks | Serve over `http://localhost` or HTTPS |

---

## Version & license notes

Static app: HTML + CSS + JS + JSON data packs. Entry point: **`index.html`**.  
LMT, FX, and USD values are **simulations for learning**.  

For short deploy notes see **`DEPLOY.md`**. For practical classroom tips see **`PRACTICAL.md`**.


## 10. Online lookup, GitHub code & reference research

Kanairoex is offline-first but can research public web sources when the browser is online.

Examples:

```text
look up photosynthesis
search GitHub for code for an offline wallet
search GitHub for JavaScript blockchain code
search Britannica for Jesus
search Oxford dictionary for wisdom
define ubiquitous
```

### GitHub code research

The GitHub adapter uses the public GitHub REST API. It searches public code first and falls back to public repositories if code search is rate-limited or unavailable. Results preserve repository links and reported license metadata. A retrieved source snippet is kept deliberately bounded; users should open the repository and review its license before reuse. GitHub documents authentication and rate-limit behavior in its REST API documentation.

### Britannica / Oxford

The reference adapter provides official Encyclopaedia Britannica and Oxford reference links. Britannica article text is not copied wholesale into the app. For dictionary lookups, a public definition fallback can be combined with Oxford Learner's Dictionaries / OED links.

Retrieved research is saved to LocalMind memory when the relevant adapter succeeds.


## Image search: how it works and how to troubleshoot it

Kanairoex recognizes commands such as:

- `look up image of Jesus`
- `search images of lions`
- `find pictures of cars`
- `show photos of airplanes`

The image pipeline is intentionally multi-layered because this is a static GitHub Pages application with no private backend:

1. **Openverse** — searches openly licensed images.
2. **Wikimedia Commons Action API** — searches Commons files and returns thumbnails plus license metadata.
3. **Wikimedia JSONP fallback** — used when a mobile browser/WebView blocks normal cross-origin `fetch()`/CORS but still permits loading public scripts.
4. **Wikipedia thumbnail fallback** — returns a representative thumbnail for well-known topics when the image-search APIs are unavailable.
5. **Direct Wikimedia search link** — shown as the final manual fallback if every automatic route fails.

The app never downloads or republishes an image automatically. It displays remote thumbnails and source/license links; check the license on the source page before reuse.

### Important GitHub Pages / service-worker detail

`image-research.js` is now **network-first** in the service worker and the project cache has been bumped to `v39`. The script URL is also versioned (`image-research.js?v=38`). This prevents an old cached image-search module from surviving a GitHub Pages deployment.

After deploying an update, open the site over HTTPS and do a hard refresh. If an old service worker is still active, close the site tabs, reopen it, and reload once or twice so the new worker activates.

### Image-search diagnostics

For developers, the browser console can inspect the last image-search attempt with:

```js
ImageResearch.diagnose()
```

It reports the configured public endpoints, whether the JSONP/Wikipedia fallbacks are enabled, and the last provider failures/successes.

### Why the old error happened

The previous implementation depended entirely on normal browser `fetch()` calls to Openverse and Wikimedia. If the browser/WebView rejected either cross-origin request, both providers could fail together and the UI only showed a generic "public image search services are unavailable" message. In addition, the service worker treated `image-research.js` as a normal cached asset rather than a network-first changing module, which could leave an older implementation active after deployment.

The current build addresses both problems.

---

## v39 Intelligence Upgrade

Kanairoex v39 adds a coherent Brain Controller on top of the existing AI Core and Reasoning engine. It does not pretend that a small browser model is a giant cloud model; instead it improves **reasonableness, evidence discipline, planning, context, verification, memory safety, and diagnostics**.

### v39 pipeline

`User → Context → Planner → Existing Reasoning/Tools → Evidence → Verification → Response → Memory`

New modules:

- `brain-context.js` — recent conversation state, active topic and lightweight entity tracking.
- `brain-planner.js` — intent classification, complexity estimation, tool selection and missing-information detection.
- `brain-evidence.js` — source ranking and calibrated evidence confidence.
- `brain-verifier.js` — routing/payload/response checks.
- `brain-controller.js` — orchestration layer and system principles.
- `benchmark.js` — deterministic browser-safe benchmark suite.

### Developer diagnostics

Open the browser console after deployment:

```js
BrainController.health()
BrainController.diagnose()
ImageResearch.diagnose()
KanairoexBenchmark.run()
```

The chat command `diagnose` also gives a short health summary.

### Knowledge correction safety

When you teach a fact that conflicts with an existing fact, v39 does **not** silently replace the old fact. It stages the new claim and asks for:

`confirm this correction`

This preserves competing versions instead of destroying prior knowledge.

### Image-search reliability

Image requests continue to use the v38 repair path, now under v39 cache/versioning:

1. Openverse fetch
2. Wikimedia Commons API
3. Wikimedia JSONP fallback for restrictive browsers/WebViews
4. Wikipedia thumbnail fallback
5. Direct Wikimedia Commons search link

The failure of one provider should not make the entire AI appear broken.

See `V39-INTELLIGENCE.md` for the complete architecture and deployment guide.
