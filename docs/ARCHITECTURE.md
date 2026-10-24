# Architecture

This page explains how jejak.js turns your code into inline values, coverage and a replayable execution.

## Pipeline

```
editor text
   │
   ▼
instrument.ts ── acorn AST ──► instrumented code + cov/vals/logs metadata + source map
   │
   ▼
build.ts ── __META + runtime.js + code ──► one script ──► Blob URL ──► Web Worker
                                                                   │
                                                 postMessage batches (every ~25 ms)
                                                                   ▼
session.ts ── ingest() ──► RunState { steps, vals, logs, errors, hits }
   │
   ▼
ui/*  inline values · coverage gutter · panels · Time Machine · Value Peek
```

## 1. Instrumentation (`src/core/instrument.ts`)

The code is parsed with acorn (`preserveParens`, `locations`). One walk over the AST inserts tracker calls as text edits:

| Inserted | Where | Purpose |
|---|---|---|
| `__s(id, [() => a, () => b])` | before every statement | coverage hit, current line, snapshot of variables in scope (Time Machine) |
| `__q(id)` | one-line bodies such as `if (x) return 1` | coverage only, so no duplicate step |
| `__e(fid)` … `finally { __x(fid) }` | function bodies | shadow call stack |
| `catch (e) { __c(e); throw e }` | function bodies | remembers the line and stack where an error was thrown |
| `__v(id, expr)` | live comments, lone identifiers, logpoints, peeks | value display |
| `__log(id, "log")(...)` | replaces `console.*` callee | console output with its line |
| `__b(id, expr)` | ternary branches and the right side of `&&` / `\|\|` | branch coverage |
| `__g(id)` | loop bodies | infinite-loop guard |
| `__ar(fid, await __as(fid, x))` | `await` in async functions | keeps the shadow stack correct across suspension |

Edits are sorted by position, then by an order key, so nested wrappers close in the right order. While the output is built, every copied chunk is recorded as a segment `{ generated offset, original offset, length }`. `genToOrig()` uses these segments to map stack-trace positions back to your code, which is how errors get an exact line and column.

**Invariant: instrumentation must not change behaviour.** `canWrap()` refuses to wrap callees, assignment targets, the middle of optional chains, and similar positions where wrapping would change meaning.

## 2. Runtime (`src/core/runtime.js`)

Plain JavaScript, loaded as a raw string and prepended to the user code inside the worker. It:

- serializes values into a small JSON tree (`{ t, p, c, n }`) with depth and size limits and cycle detection;
- records up to 5000 Time Machine steps; after that only coverage keeps counting;
- batches events and posts them every ~25 ms (or every 300 events);
- subtracts its own overhead from `/*?.*/` timings;
- throws `RangeError` after 3 million statements or loop iterations (infinite-loop guard). The page also terminates the worker after 4 seconds.

## 3. Session (`src/core/session.ts`)

`ingest()` turns batches into a `RunState`: steps (line, variables, call stack), values, logs and errors. Error stacks are mapped through the source map. This module has no DOM code. `test/harness.ts` runs the real runtime in a Node `vm` context, so the whole pipeline is tested without a browser.

## 4. UI (`src/ui/`)

| File | Responsibility |
|---|---|
| `editor.ts` | CodeMirror setup, coverage gutter, inline values, error marks, Time Machine line |
| `panels.ts` | Value Explorer, Console, execution order, stack & watch |
| `timemachine.ts` | stepping logic and the timeline canvas |
| `peek.ts` | hover / selection Value Peek and the per-iteration hover list |
| `ide.ts` | autocomplete, snippets, formatting, editor settings |
| `tree.ts` | value tree and graph rendering |

## Design rules

- Never block the page: user code always runs in a worker.
- Never surprise the user: automatic editor features must not undo or re-insert typed text.
- Everything works offline except Prettier and the web fonts, which load from a CDN.
