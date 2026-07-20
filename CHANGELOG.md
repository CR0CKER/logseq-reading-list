# Changelog

All notable changes to this project are documented here. The format is based
on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project
adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Security

- Fix a DOM-XSS in the "create book page" confirm dialog: a book title from
  Open Library (records are publicly editable) or Google Books containing HTML
  such as `<img src=x onerror=…>` reached `innerHTML` unescaped and executed in
  the plugin iframe. Titles — and all third-party book data rendered to markup —
  are now HTML-escaped at every `innerHTML` sink. (audit finding **H1**)
- Bump `@logseq/libs` `0.0.17` → `0.3.4`, clearing a critical transitive
  DOMPurify advisory, and pin its remaining transitive deps to patched,
  same-major versions via `overrides` (`dompurify` `3.4.12`, `lodash-es`
  `4.18.1`). `npm audit --omit=dev` now reports **0 vulnerabilities** in shipped
  dependencies, and the CI `audit` job is an enforcing gate. (audit finding
  **H2**)

### Added

- `.github/dependabot.yml` — weekly grouped dependency updates for the `npm`
  and `github-actions` ecosystems, and SHA-pinned the third-party
  `softprops/action-gh-release` release action (was a mutable `@v2` tag) to
  `v2.6.2`. (audit finding **L3**)
- `src/html.ts` — a single, complete `escapeHtml()` (escapes `& < > " '`)
  shared by the search modal and the grid renderer, replacing two divergent
  local escapers (one of which omitted `>`). (audit finding **L4**)
- Test suite: `vitest` (`npm test`). Covers the H1 XSS-escaper regression plus
  the `render.ts` pure parser/sanitiser functions — `sanitisePageName`,
  `normalisePublished`, `extractIsbn`, `truncate`, `sanitisePropertyValue`
  (entity-decode / tag-strip / `::` neutralisation), `sanitiseForWikilink`,
  and template rendering (`renderBookPageProperties` status-injection,
  `renderBlock`), with positive and negative regex cases. (audit findings
  **H1**, **M2**)
- CI gates in `.github/workflows/ci.yml`: `typecheck` (strict `tsc --noEmit`),
  `test`, a `gitleaks` secret scan (SHA-pinned action), and an enforcing
  `npm audit` job. (audit finding **M1**)

### Changed

- Every outbound `fetch` (Open Library / Google Books search, description
  lookup, cover download) now runs through `fetchWithTimeout` (`src/net.ts`)
  with an `AbortController` budget — 10s for the JSON APIs, 15s for the cover
  image. A hung connection now surfaces a "timed out" error (or falls back to
  the remote cover URL) instead of leaving the modal stuck on "Searching…".
  (audit finding **M4**)
- `tsconfig.json`: enabled `strict` (was `strict: false` with
  `noImplicitAny: false`); fixed the resulting type errors in `index.ts`,
  `search.ts`, and `createPagesByISBN.ts`. (audit finding **M1**)
- Protected `master` with a repository ruleset: pull-request-only (squash,
  linear history), all five CI checks required before merge, direct pushes and
  force-pushes rejected (admins included). Documented in the README
  *Contributing* section. (audit finding **M3**)

### Known issues

- A dev-only advisory remains in the `vitest`/`vite` test toolchain (never
  shipped; not caught by the `--omit=dev` audit gate). Clearing it needs a
  breaking `vitest` 2→4 major bump, tracked separately.

## [0.3.0]

- Prior releases predate this changelog; see the Git history and GitHub
  Releases for details.
