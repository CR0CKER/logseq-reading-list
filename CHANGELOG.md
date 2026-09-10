# Changelog

All notable changes to this project are documented here. The format is based
on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project
adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.5.0] - 2026-09-10

### Added

- **Default Reading List filter** setting (`defaultFilter`: All / To Read /
  Reading / Read / Favorites) — the chip selected each time the Reading List
  page opens. A filter argument on the renderer macro still takes precedence.

### Changed

- The grid's filter now resets to the configured default each time the page
  opens, instead of keeping the last-clicked chip until Logseq reloads.
- The filter chips now sit directly under the page title, where the first
  bullet sits on a normal page. The grid inherited Logseq's block-content
  `white-space: pre-wrap`, which rendered the template's line breaks and
  indentation as two blank text lines (~42px) above the chips; the grid now
  sets `white-space: normal`.
- Bumped `vitest` `^2.1.9` → `^4.1.10` (dev-only, breaking major). Clears the
  last remaining `npm audit` advisories — they were in the `vitest`/`vite`
  test toolchain (never shipped in the plugin). Full `npm audit`, including dev
  dependencies, reported **0 vulnerabilities** at the time (see *Known issues*
  below for advisories published since). All 44 tests pass unchanged
  on the new major (the suite exercises the `vitest` API, so it doubles as the
  upgrade contract test). Resolves the v0.4.0 *Known issues* note.

### Removed

- The ↻ refresh button on the grid. The query already re-runs every time the
  page opens (adding a book navigates to the new page, so returning shows it);
  *Reading List: refresh grid* in the command palette remains for the
  grid-open-in-another-pane case.

### Security

- Bump the `dompurify` override (transitive via `@logseq/libs`) `3.4.12` →
  `3.4.14`, fixing [GHSA-55q2-fjhq-7xh7](https://github.com/advisories/GHSA-55q2-fjhq-7xh7)
  (moderate; XSS via `IN_PLACE` hook removal, published 2026-08-07, patched in
  `3.4.13`). `3.4.14` chosen over the 4-day-old `3.4.15` as a release-age
  cooldown. `npm audit --omit=dev` reports **0 vulnerabilities** again.

### Known issues

- Dev-only advisories published since 0.4.0 remain in the Parcel/Vitest
  toolchain (`nanoid`, `postcss`, `browserslist`, `baseline-browser-mapping`,
  `vitest`). None of these packages ship in the plugin, and the CI audit gate
  (`--omit=dev`) is green. Non-breaking fixes exist; tracked for a follow-up.

## [0.4.0] - 2026-07-20

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

- Self-hosted the modal UI font: removed the Google Fonts `<link>` and
  inlined Inter (static latin weights 400/600/700, from `@fontsource/inter`)
  as a base64 `@font-face` in `index.html`. The modal no longer fetches from
  `fonts.googleapis.com`/`gstatic.com` on open — dropping a per-open data leak
  to Google and an external dependency / CSP surface — yet still renders Inter
  fully offline. A base64 data-URI face (self-contained, no URL to resolve, no
  JS import) is a deliberately different mechanism from the earlier
  `@fontsource-variable/inter` bundle that destabilised the iframe and was
  reverted; verified loading + rendering in headless Chromium (Logseq's
  engine), including inside a parent-less-face iframe. (audit finding **L1**)
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
