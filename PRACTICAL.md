# Kanairoex Final Build (v9.5.2)

Private, offline-first browser AI with system tokens, P2P transfers, thinking pipeline, and knowledge memory.

## Core capabilities

| Area | What works |
|------|------------|
| **Chat + thinking** | 5-stage process: receive → process → intent → generate → reply |
| **Knowledge** | Teach facts, search memory, citations, pin/unpin |
| **Files** | Upload/study text; long-doc chunked study |
| **Online → memory** | Lookups saved with source + dedupe |
| **System tokens** | Create (10,000 LMT creation fee), swap LMT↔token, balances |
| **P2P** | Tokens, text, images, files, video between users |
| **Self-evolution** | Local skills / upgrade log (no remote code) |
| **Backup** | Export knowledge + wallet snapshot |

## System tokens (between Kanairoex users)

```text
wallet
create token MYT MyToken 1000000 0.01    # costs 10,000 LMT
swap 100 LMT MYT
swap 50 MYT LMT
p2p pay 10 MYT LMT-THEIR-ADDRESS
flush outbox
```

New wallets start with **5000 LMT**. Tokens move over **WebRTC P2P** when the channel is open (works across countries if the network allows, e.g. Kenya ↔ USA).

## P2P media

```text
p2p setup
webrtc offer          # share SDP with peer
webrtc answer …       # peer replies
p2p status            # channel must be open
p2p file              # send image / video / any file
p2p send hello
```

## Thinking

```text
how do you think
explain your process
```

## Deploy

Static host the folder (HTTPS recommended). No backend required.  
Hard-refresh after install so the service worker picks up new scripts.

## Limits (honest)

- Ledger is **device-local + P2P**, not a public chain like Bitcoin
- Not bank money or an exchange-listed asset
- Some networks need better NAT traversal (STUN is included; TURN is not)
- No true video/music *understanding* models — transfer yes, AI analyze no

## Local LLM + Multimodal (new)

| Capability | How |
|------------|-----|
| **Local LLM** | WebLLM (MLC) over WebGPU. Load from **AI Lab** or type `load llm` / `load llm Phi-3.5-mini-instruct-q4f16_1-MLC` |
| **Recommended models** | Phi-3.5 Mini (~2.4 GB), Llama 3.2 1B (~0.8 GB), Gemma 2 2B, TinyLlama |
| **Multimodal** | Transformers.js image captioning + optional caption→LLM visual QA. Use **AI Lab → Analyze Image** or the 🖼️ chip / drag-drop an image |
| **Commands** | `llm status`, `list models`, `unload llm`, `load llm <model-id>` |

Models download once and are cached by the browser. Classic rule/memory engine remains the fallback when no LLM is loaded or WebGPU is missing.

### Updated limits
- Local LLM requires **WebGPU** (Chrome/Edge 113+ recommended)
- Multimodal currently focuses on **images** (caption + VQA via caption+LLM). Full video understanding is not included
- First model load needs network; afterwards works offline from cache

## Ollama & LM Studio (native backends)

Kanairoex can drive full desktop AI runtimes on the same machine:

| Backend | Default URL | How to start |
|---------|-------------|--------------|
| **Ollama** | `http://localhost:11434` | Install from ollama.com, then `ollama serve` or open the app. Pull a model: `ollama pull llama3.2` |
| **LM Studio** | `http://localhost:1234` | Open LM Studio → Developer/Server → Start server. Load a model. Enable CORS if needed. |
| **llama.cpp server** | `http://localhost:8080` | Run `llama-server` with OpenAI-compatible flags |
| **Custom** | user-defined | Any OpenAI-compatible `/v1/chat/completions` endpoint |

### Chat commands
```
probe backends
llm status
list models
use ollama
use ollama llama3.2
use lmstudio
use lmstudio mistral
use webllm
use classic
```

### Priority
1. Active external backend (Ollama / LM Studio / …) — full system GPU/RAM  
2. Browser WebLLM (WebGPU)  
3. Classic Kanairoex engine  

Data still stays local: the browser only talks to `localhost`.


## Space Communications (NASA-inspired)

Classic pre-internet spaceflight protocols implemented locally:

| Command | Effect |
|---------|--------|
| `telemetry` / `tm` | Emit a telemetry frame |
| `beacon on` / `beacon off` | Periodic heartbeat telemetry |
| `beacon on 30s` | Beacon every 30 seconds |
| `CMD TEACH subject="X" fact="Y"` | Formal command with ACK/NACK |
| `CMD STATUS` | Status via command protocol |
| `CMD BEACON action=on` | Beacon via CMD |
| `queue <message>` | Delay-tolerant outbox |
| `outbox` | List queued messages |
| `flush outbox` | Send when P2P peer is in view |
| `callsign LM-7` | Set spacecraft callsign |

Example telemetry frame:
```
TM 0042 2026-08-20T18:05Z LM-1 OK MEM:14.1MB KNOW:12 NEURONS:120 LLM:none P2P:down NET:up BEACON:on CS:A3F2
```


## Secure Memory (encrypted + compressed)

Memory can be sealed into an opaque machine-readable blob:

1. **Serialize** structured knowledge / cognitive / history data  
2. **Compress** with gzip (browser CompressionStream)  
3. **Encrypt** with AES-GCM-256 (key from password via PBKDF2)

| Command | Effect |
|---------|--------|
| `seal memory <password>` | Compress + encrypt current memory into vault |
| `unlock memory <password>` | Decrypt and restore |
| `lock memory` | Clear key from RAM |
| `save vault` | Re-seal while unlocked |
| `secure status` | Show vault size / ratio / algorithm |

Notes:
- Output is **not human-readable** (binary ciphertext).
- Compression is realistic (often 3–10× on text knowledge), not 10,000×.
- Password never stored; only a random salt is kept locally.
