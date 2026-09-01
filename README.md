# IN WRITING

IN WRITING is a WebMCP Challenge prototype: a page listens to a synthetic debt-collection call, detects a bounded acoustic risk phrase, and pairs that signal with dated sample-file facts before any agreement is made.

The current demonstration is intentionally narrow. It recognizes **one calibrated synthetic phrase** (`good-faith payment`); it does not claim broad speaker generalization, determine the legal status of a real debt, or provide legal advice. No real collector is recorded or contacted.

## Why the detector is narrow

The first implementation used local Whisper ASR over the real `<audio>.captureStream()` track. It detected the payment language, but missed precommitted execution gates: 35.48% word error rate and a 16.707-second warning. The shipped closed-vocabulary matcher warns around eight seconds and stores zero full-transcript words. The same page-owned live `MediaStreamTrack` remains the input.

## WebMCP surface

The page dynamically replaces its tool set as the synthetic call moves through ready, listening, detected-signal, review and closed states. At most six tools are live at once. `get_transcript_since` is cursor-based but returns only detected closed-vocabulary signals; no full transcript exists.

External transmission is not a tool. The page exposes dated facts and official-source references; every external action remains human-only.

## Run locally

Prerequisites: Node.js 20+ and pnpm 10+.

```bash
pnpm install --frozen-lockfile
pnpm test
pnpm typecheck
pnpm build
pnpm dev
```

Open <http://127.0.0.1:4317/>. WebMCP itself requires a supported origin-trial browser and the registered public origin; the local acoustic demonstration degrades cleanly when `document.modelContext` is absent.

## Evidence

- `receipts/asr-spike-live.json` — frozen full-ASR `FAIL` with the original thresholds.
- `receipts/keyword-spotter-live.json` — Chrome 154 live-track acoustic match.
- `public/keywords/manifest.json` — synthetic audio/template provenance and hashes.

## License

MIT — see [LICENSE](LICENSE).
