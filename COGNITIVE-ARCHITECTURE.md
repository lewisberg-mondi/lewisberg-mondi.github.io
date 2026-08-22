# Kanairoex Cognitive Architecture

Kanairoex now has a browser-local cognitive layer (`cognitive-engine.js`).

## Working memory
Maintains the current goal, relevant conversation, facts, assumptions, unfinished tasks,
plan, open questions, hypotheses, evidence, tool results, active concepts, errors and next action.

## Long-term memory
Typed memories:
- episodic — what happened and previous task outcomes
- semantic — facts/concepts
- procedural — successful workflows
- preference — stable user/project preferences

Every memory carries importance, confidence, timestamp, source, last_used, decay and supersession links.

## Retrieval
Memory retrieval combines semantic similarity, recency, importance, confidence, relationship score and type matching.
Low-confidence memories are filtered. Superseded memories are not returned by default.

## Knowledge graph + associative activation
Concepts become graph nodes and relationships become weighted edges. Existing Hebbian `Neurons`
are also co-activated, giving Kanairoex an associative layer without pretending to simulate biological neurons.

## Reasoning workspace
The current task is represented as:
GOAL / FACTS / UNKNOWN / ASSUMPTIONS / HYPOTHESES / OPTIONS / EVIDENCE / PLAN / RESULT / CONFIDENCE.
The workspace persists while a task is active and is saved locally.

## Multi-pass orchestration
Easy tasks use one pass, medium tasks three, and hard tasks five. The system records specialist modes
(planner, researcher, analyst, coder, strategist, critic, synthesizer) and performs post-answer evaluation.
It does not expose hidden chain-of-thought.

## Learning gate
Successful work can be converted into procedural memory only when the outcome is marked successful or has
a sufficient score. Duplicate, low-importance and low-confidence candidates are rejected.

## Commands
- `mind state`
- `cognitive status`
- `working memory`
- `memory types`
- `memory search <query>`
- `knowledge graph`
- `graph status`
- `forget cognitive memory`

The normal Kanairoex commands continue to use the existing Knowledge, RAG, blockchain, wallet, token and tool systems.

## Local LLM layer

When a WebLLM model is loaded (`local-llm.js` + `llm-bridge.js`), open-ended questions are routed to the real local model. The cognitive working memory and knowledge snippets are injected as context. Pure commands (wallet, P2P, teach, etc.) stay on the classic engine.

## Multimodal layer

`multimodal.js` provides on-device image captioning (Transformers.js). Visual questions are answered by captioning the image and then (when available) asking the local LLM, giving a practical browser-local VQA path without a full vision-language model download.
