# Contributing to jejak.js

Thank you for helping! Issues and pull requests are welcome in **English or Bahasa Indonesia**.

## Ways to help

- **Report a bug**: use the **Share** button in the app and paste the link into the issue. It contains your exact code.
- **Suggest a feature**: open a feature request and describe what you want to do.
- **Add an example**: `src/examples.ts`.
- **Improve a translation**: `src/i18n.ts`.
- **Pick an item** from the roadmap in the README, or an issue labelled `good first issue`.

## Development setup

```bash
git clone https://github.com/<your-username>/jejak-js.git   # your fork
cd jejak-js
npm install
npm run dev      # http://localhost:5173
```

Before opening a pull request:

```bash
npm run check    # TypeScript + tests
npm run build    # make sure the site builds
```

## Workflow

1. Fork the repository and create a branch from `main`, for example `fix/loop-values` or `feat/dom-mode`.
2. Make your change in small, focused commits. Clear messages help, for example `fix: keep call stack after await`.
3. Add or update tests when you change behaviour.
4. Open a pull request and describe **what** changed and **how you tested it**. Screenshots help for UI changes.

## Where things live

| Path | What |
|---|---|
| `src/core/instrument.ts` | Parses user code and inserts tracker calls. Most "wrong value" or "code broke" bugs are here. |
| `src/core/runtime.js` | Tracker that runs inside the Web Worker. Plain JS loaded as a raw string, so keep it self-contained (no imports). |
| `src/core/session.ts` | Turns worker messages into the run model (steps, values, logs, errors). |
| `src/core/coverage.ts` | Line coverage. |
| `src/ui/` | Editor decorations, panels, Time Machine, Value Peek, autocomplete / snippets / formatting. |
| `src/i18n.ts` | UI strings. Add every key to **both** `en` and `id`. |
| `src/examples.ts` | Built-in examples. `«english|indonesia»` markers produce both languages. |
| `test/` | Vitest. `test/harness.ts` runs the real runtime in a Node `vm`, so behaviour can be tested without a browser. |

## Guidelines

- **Instrumentation must never change program behaviour.** When you add a transform, add a sample to `SAMPLES` in `test/instrument.test.ts` (it checks the output still parses) and a behaviour test in `test/run.test.ts`.
- **No surprises in the editor.** Automatic features must never undo or re-insert what the user typed.
- Keep the UI usable at phone width and in every theme. Colors come from CSS variables in `src/styles.css`, so do not hard-code colors.
- Keep dependencies small. The app runs entirely in the browser.

## Code of Conduct

By taking part you agree to follow the [Code of Conduct](CODE_OF_CONDUCT.md).
