# Logseq Reading List

Search **Open Library or Google Books** by title, author, or ISBN, pick the
right edition from a clean themed result list, and generate a
**template-based book page** in Logseq — with the cover saved locally as
a real asset, the description as a Markdown quote, ISBN / publisher /
author as properties, and a reading `status::`. A built-in macro
(`{{renderer :reading-list}}`) renders all of it as a **visual cover
grid** with status filters and a sort dropdown.

> Works with Logseq **file-based** graphs on **desktop only** — Logseq
> Mobile doesn't run plugins, so the grid won't render there (book
> pages themselves still display fine).

Forked from [YU000jp/logseq-plugin-google-books](https://github.com/YU000jp/logseq-plugin-google-books)
(MIT). See `LICENSE` for attribution.

---

## What's different from upstream

- **Fixed the broken search + added Open Library** as the default
  source. The original plugin returned zero results in non-US regions
  because Google Books silently requires a `country` parameter; Open
  Library has no such constraint and no quota.
- **Theme-native modal** rendered with Logseq's own `--ls-*` colour
  variables and `--ls-font-family`, with a light/dark fallback if the
  iframe can't read the parent. SweetAlert2 removed entirely.
- **Outlined Lucide icons** matching the koreader plugin's style
  (`book-plus` in the toolbar, `chevron-down` on the sort dropdown).
- **Customisable Mustache templates** for the page properties, cover
  image block, description quote, and source-link block — editable in
  settings, parsed back to `key:: value` lines safely.
- **Real local cover assets** (`assets/storages/<plugin-id>/<isbn>.jpg`),
  written via `setItem(file, arrayBuffer)` — the proven binary pattern
  used by `logseq-plugin-multiple-assets`. Falls back to the remote URL
  if the fetch fails. The `cover` property holds the bare path, not the
  markdown — short and editable.
- **Page layout in the user's preferred order**: cover image block,
  properties block, description (`> quote`), source link — all left-
  aligned with the page title.
- **Plugin-rendered visual cover grid** via
  `{{renderer :reading-list}}`. Full-width responsive CSS grid, status
  filter chips (All / To read / Reading / Read), and a sort dropdown
  (Recently added / A → Z, persisted across reloads).
- English-only (Japanese i18n / dateutils dependencies removed).

---

## Install (unpacked)

```bash
npm install
npm run build      # outputs dist/
```

In Logseq: **Settings → Advanced → Developer mode**, then **Plugins →
Load unpacked plugin** → select this folder.

> If `node` on your `PATH` is an x86-64 `nvm` binary on an aarch64
> machine, the build fails with "Exec format error". Use Fedora's
> system Node 22 (`/usr/bin/node`).

---

## Use

- Click the **book-plus** toolbar button (or command palette →
  *Reading List: add a book…*).
- Choose **Title / Author / ISBN** or paste many ISBNs in **Bulk ISBN**.
  Enter submits the search; Esc closes the modal.
- Click **Add to Logseq** on a result, confirm with Enter, page is
  created.
- Command palette → *Reading List: open index page* opens the grid.
  Filter chips switch which `status::` values are shown; the **Recently
  added ⌄** dropdown toggles sort (saved across reloads).

---

## Reading List index page

The plugin seeds a page (default name: **Reading List**) containing the
macro `{{renderer :reading-list}}`. When Logseq renders that block, the
plugin handles the slot and emits:

- A Datascript query for every page with a `status::` property (works
  whether the property is on the page itself or on a content block).
- A themed CSS grid of cover cards. Each card links to the book page.
- A status filter (All / To read / Reading / Read), a sort dropdown
  (persisted via `logseq.settings.lastSort`), and a refresh button.
- The bullet of the renderer block is hidden via CSS; the grid breaks
  out of Logseq's prose `max-width` and the inline-span ancestor so it
  uses the full page width and reflows responsively on resize.

---

## Book page layout

Each newly added book is a page with **four sibling blocks** in this
order:

1. **Cover image** — a regular block containing the markdown image,
   left-aligned, full-width.
2. **Properties block** — an empty-content block carrying the rendered
   `key:: value` lines (`status::`, `author::`, `publisher::`,
   `isbn::`, `published::`, `pages::`, `cover::`, `category:: #Books`,
   and `tags::` populated with topic subjects from Open Library /
   categories from Google Books). The convention matches
   `sync-koreader-highlights`: `category::` marks the page type
   (`#Books`); `tags::` is reserved for topic tags (what the book is
   *about*) and stays editable per book.
3. **Description** — `> Markdown blockquote` with the synopsis
   (HTML-sanitised and truncated to 500 chars).
4. **Source link** — `[More about this book ↗](...)` to the
   Open Library or Google Books record.

Properties live on a content block (not as page-level properties)
because Logseq always renders page-level properties between the title
and the first block, which would have pinned them above the cover.
Backlinks from `[[Author]]`, topic `[[tags]]`, etc. still work the same.

---

## Data source

Two sources, switchable in settings (**Book data source**):

- **Open Library** (default, recommended) — Internet Archive's open
  database. Completely **keyless, no quota, no rate limits**. Works out
  of the box. Cover by ISBN via `covers.openlibrary.org`; description
  fetched lazily from the work record only for the picked book.
- **Google Books** — sometimes richer descriptions, but its keyless
  requests share a **single anonymous quota pooled across every caller
  worldwide**; when exhausted you get HTTP 429 *regardless of your IP*.
  If you choose it, add a free API key
  (<https://console.cloud.google.com/apis/credentials>, enable the
  **Books API**) in the **Google Books API key** setting.

> Amazon's Product Advertising API was evaluated and rejected: it
> requires an approved Amazon Associates account with ongoing affiliate
> sales (3 in 180 days to get in, 10 every 30 days to keep), and PA-API
> is being deprecated as of May 2026.

---

## Settings

| Key | Default | What it does |
|---|---|---|
| `dataSource` | `Open Library` | Provider used by the search modal. |
| `apiKey` | *(empty)* | Optional Google Books API key for a private quota. Ignored for Open Library. |
| `country` | `US` | Two-letter Google Books country code. Required by their API; ignored for Open Library. |
| `saveImage` | `true` | Download covers into the graph; if off, the remote URL is used. |
| `defaultStatus` | `to-read` | `status::` value applied to new books (`to-read` / `reading` / `read`). |
| `pageNamePrefix` | *(empty)* | Optional namespace prefix for book pages (e.g. `Books/`). |
| `readingListPageName` | `Reading List` | Name of the page that hosts the cover grid. |
| `bookPageTemplate` | *(Mustache)* | Property block template. |
| `coverBlockTemplate` | *(Mustache)* | Cover image block template. Set empty to suppress. |
| `descriptionBlockTemplate` | *(Mustache)* | Description block template. |
| `gbooksLinkTemplate` | *(Mustache)* | Source-link block template. |
| `lastSort` *(hidden)* | `added` | Grid sort preference; written automatically by the dropdown, persisted across reloads. |

Command palette entries:

- *Reading List: add a book…* — opens the search modal
- *Reading List: open index page* — opens the grid page, seeding it if missing
- *Reading List: refresh grid* — re-runs the Datascript query
- *Reading List: reset templates to defaults* — restores all template settings

### Mustache template variables

`{{title}}`, `{{fullTitle}}`, `{{author}}`, `{{authorLinked}}` (each
author as `[[wikilink]]`), `{{publisher}}`, `{{isbn}}`, `{{published}}`
(yyyy/MM), `{{pageCount}}`, `{{description}}` (HTML-decoded,
truncated), `{{cover}}` (bare path or URL), `{{coverImage}}`
(`![cover](src)` markdown), `{{coverSrc}}` (raw remote thumbnail URL),
`{{tags}}` and `{{tagsLinked}}` (topic tags from the source's
`subject` / `categories` fields, capped at 5),
`{{infoLink}}`, `{{status}}`.

`status` is force-injected after parsing even if a custom template
omits it — the grid query depends on it.

---

## Source layout

| File | Role |
|---|---|
| `src/index.ts` | Plugin bootstrap, settings schema, `backfillTemplateDefaults`, toolbar registration, command palette, macro registration |
| `src/modal.ts` | Themed search modal (in plugin iframe), segmented mode picker, result cards, inline confirm dialog |
| `src/search.ts` | `searchBooks` wrapper, themed status / error messaging in the result area |
| `src/providers.ts` | `BookResult` normalised type; Open Library and Google Books implementations; `currentSource()`, lazy `fetchDescription()` |
| `src/createBookPage.ts` | Builds a `BookView` from a `BookResult`, renders properties via templates, creates the four-block page, calls `ensureReadingListIndex()` |
| `src/createPagesByISBN.ts` | Bulk-ISBN import loop |
| `src/toAssets.ts` | `saveCoverAsset()` — fetches the cover, writes the raw ArrayBuffer to sandbox storage |
| `src/render.ts` | Mustache rendering, sanitisers (`sanitisePageName`, `sanitisePropertyValue`, `stripHtmlTags`, `decodeHtmlEntities`, `truncate`), `parseInlineProperties` |
| `src/readingList.ts` | Macro renderer for `{{renderer :reading-list}}`: Datascript query, grid HTML + themed CSS, filter chips, sort dropdown, index-page seeding |
| `src/theme.ts` | Pulls Logseq's live `--ls-*` colour and font variables into the plugin iframe, with light/dark fallback |
| `src/lib.ts` | Modal helpers (`openModal`, `closeModal`, `setMainUIApp`, `pageOpen`, `bookPageName`) |
| `src/index.html` | Plugin iframe entry point + stylesheet |
| `icon.svg` | Plugin marketplace icon (Lucide book) |

---

## Credits / prior art

- Forked from [@YU000jp/logseq-plugin-google-books](https://github.com/YU000jp/logseq-plugin-google-books) (MIT).
- Architecture reference for Mustache templates + settings backfill:
  Nils's `sync-koreader-highlights` plugin.
- Asset-write pattern verified against
  [@YU000jp/logseq-plugin-multiple-assets](https://github.com/YU000jp/logseq-plugin-multiple-assets).
- [Open Library API](https://openlibrary.org/developers/api),
  [Google Books API](https://developers.google.com/books/docs/v1/using),
  [Lucide icons](https://lucide.dev).
