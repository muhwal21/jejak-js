# Changelog

All notable changes are listed here. The format follows [Keep a Changelog](https://keepachangelog.com/) and the project uses [Semantic Versioning](https://semver.org/).

## [Unreleased]

## [0.1.0]: first public release

### Added
- Live execution in a Web Worker with automatic, on-save and manual run modes.
- Inline values for `console.log`, lone identifiers, errors and live comments (`//?`, `/*?*/`, `/*?.*/`, `/*?+*/`, `//? $.prop`).
- Loop values listed per execution, with a hover list of every iteration.
- Value Peek for any selected expression; logpoints (F9) and pinned expressions (Shift+F9).
- Line coverage gutter with shaded uncovered code; errors underlined at the exact column with the call path marked.
- Time Machine with step into / over / out / back, auto-play, jump to line and an interactive timeline; async-aware call stack.
- Execution order ("code story"), Value Explorer with tree and graph views, call stack and watch panel.
- Editor: autocomplete, snippets, Prettier formatting with gentle auto-format, auto-closing brackets, comment toggle, multi-cursor, search, folding.
- Themes (light, dark, sepia, ocean, high contrast), English and Bahasa Indonesia UI, share links.
- Single-file build (`npm run build:single`), CI and GitHub Pages deployment.

[Unreleased]: https://github.com/muhwal21/jejak-js/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/muhwal21/jejak-js/releases/tag/v0.1.0
