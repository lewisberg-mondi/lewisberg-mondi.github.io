# Kanairoex / LocalMind test commands

Run from the project root:

```bash
node TEST-system.js
node TEST-token-system.js
node TEST-ledger-supply.js
node TEST-web-research.js
```

All should finish with `PASS`. `TEST-web-research.js` uses mocked browser APIs so it does not require internet access; deploy-time internet behavior should also be checked on GitHub Pages.
node tests/github-reference.test.js
