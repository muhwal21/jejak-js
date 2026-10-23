# jejak.js

**An open-source JavaScript playground that shows what your code is doing while you type.**
Inline values, live comments, code coverage, a Value Explorer and a Time Machine debugger — all running in the browser, no install, no server.

*Jejak* is Indonesian for "trace" or "footprint". 🇮🇩 [Baca dalam Bahasa Indonesia](README.id.md)

![jejak.js screenshot](docs/screenshot.png)

## Features

| | |
|---|---|
| **Live execution** | Runs on every keystroke (or on save / on demand). |
| **Inline values** | `console.log` output, identifiers on their own line and errors appear at the end of the line. |
| **Live comments** | `//?` `/*?*/` value · `/*?.*/` value + time · `/*?+*/` full depth · `//? $.length` transform the value. |
| **Value Peek** | Select *any* expression to evaluate it in its real context. Hover a variable to see its recorded value. |
| **Logpoints & inline breakpoints** | Click the gutter (F9) to log a whole line; select an expression and press Shift+F9 to pin it. |
| **Coverage** | Gutter shows covered / partial / uncovered lines; the exact code that did not run is shaded. |
| **Errors** | Underlined at the exact column, with the call path highlighted. |
| **Value Explorer** | Expandable tree of every value, copy as JSON, or view it as a graph. |
| **Time Machine** | Step into / over / out, step back, auto-play, jump to the cursor line, an interactive timeline colored per function. Call stacks stay correct across `await`. |
| **Execution order** | A "code story" listing of every executed line, in order, with who called whom. |
| **Share links** | The code is compressed into the URL — no backend. |
| **English / Bahasa Indonesia** | UI and examples in both languages. |

## Getting started

```bash
git clone https://github.com/your-username/jejak-js.git
cd jejak-js
npm install
npm run dev      # http://localhost:5173
```

| Script | |
|---|---|
| `npm run dev` | Dev server with hot reload |
| `npm test` | Unit + runtime tests (Vitest) |
| `npm run typecheck` | TypeScript |
| `npm run check` | Both of the above |
| `npm run build` | Static build in `dist/` |

### Deploy to GitHub Pages

The workflow in `.github/workflows/pages.yml` deploys every push to `main`.
In your repository go to **Settings → Pages → Build and deployment → Source: GitHub Actions**. Then update `REPO_URL` in `src/config.ts`.

## How it works

```
 your code ──► instrument.ts (acorn) ──► instrumented code + source map
                                              │
                    runtime.js + code ──► Web Worker (blob URL)
                                              │  postMessage batches
                                              ▼
                     session.ts (ingest) ──► editor decorations, panels, Time Machine
```

1. **`src/core/instrument.ts`** parses the code with [acorn](https://github.com/acornjs/acorn) and inserts small tracker calls: `__s()` before each statement (coverage + a snapshot of variables in scope), `__e/__x` around functions (call stack), `__v()` around expressions to display, `__log()` instead of `console.*`, `__as/__ar` around `await`. It also records a source map so stack traces can be translated back to your code.
2. **`src/core/runtime.js`** is the tracker that runs in the worker. It serializes values into a small JSON tree and streams batches back to the page. Time spent inside the tracker is subtracted from `/*?.*/` timings.
3. **`src/core/session.ts`** turns those batches into a run model (steps, values, logs, errors). It has no DOM code, so it is unit-tested in Node by running the real runtime in a `vm` context (`test/harness.ts`).
4. **`src/ui/*`** renders the editor (CodeMirror 5), the panels and the Time Machine.

Code runs in a Web Worker, so an infinite loop never freezes the page: there is a statement/iteration limit plus a 4-second watchdog.

## Limitations & roadmap

Contributions welcome — these are good places to start:

- [ ] **DOM mode**: run in a sandboxed iframe so `document`, canvas and `fetch` work
- [ ] **npm imports** via an ESM CDN (`import _ from 'lodash'`)
- [ ] **TypeScript** input (strip types with sucrase / esbuild-wasm)
- [ ] Upgrade to **CodeMirror 6** (autocomplete, lint, better mobile editing)
- [ ] **Edit and continue** in the Time Machine
- [ ] Multiple files / tabs
- [ ] Call stacks for generators (`yield`)
- [ ] Watch expressions with arbitrary expressions (currently variable paths)
- [ ] More than 5000 recorded steps (stream to IndexedDB)

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). Bug reports with a **Share** link are the easiest to fix.

## Acknowledgements

Inspired by [Quokka.js](https://quokkajs.com/) by Wallaby.js. jejak.js is an independent project with no affiliation; it does not share any code with Quokka.

## License

[MIT](LICENSE)
