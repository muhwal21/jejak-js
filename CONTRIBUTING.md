# Contributing to jejak.js

Thanks for helping! Issues and pull requests are welcome in English or Bahasa Indonesia.

## Setup

```bash
npm install
npm run dev     # app at http://localhost:5173
npm run check   # typecheck + tests — run this before opening a PR
```

## Where things live

| Path | What |
|---|---|
| `src/core/instrument.ts` | Parses user code and inserts tracker calls. Most bugs about "wrong value" or "code broke after instrumenting" are here. |
| `src/core/runtime.js` | Tracker that runs inside the worker. Plain JS loaded as a raw string — keep it self-contained (no imports). |
| `src/core/session.ts` | Turns worker messages into the run model. |
| `src/core/coverage.ts` | Line coverage. |
| `src/ui/` | Editor decorations, panels, Time Machine, Value Peek. |
| `src/i18n.ts` | UI strings. Add a key to **both** `en` and `id`. |
| `src/examples.ts` | Built-in examples. `«english|indonesia»` markers produce both languages. |
| `test/` | Vitest. `test/harness.ts` runs the real runtime in a Node `vm`, so you can test end-to-end without a browser. |

## Guidelines

- **Instrumentation must never change behaviour.** If you add a transform, add a sample to `SAMPLES` in `test/instrument.test.ts` (it checks the output still parses) and a behaviour test in `test/run.test.ts`.
- Keep the UI usable at phone width and in both light and dark themes (colors come from CSS variables in `src/styles.css`).
- Small, focused PRs are easier to review. Describe how you tested.

## Reporting bugs

Use the **Share** button in the app and paste the link in the issue — it contains the exact code.
