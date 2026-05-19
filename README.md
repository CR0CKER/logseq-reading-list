# Logseq Reading List

Search Google Books by **title, author, or ISBN**, pick the right edition from a
clean themed result list, and generate a **template-based book page** in Logseq —
with the cover saved locally, the description, author, ISBN and a reading
`status::`. A built-in macro renders a **visual cover grid** so the whole graph
becomes a browsable reading list.

> Works with Logseq **file-based** graphs.

This is a fork of [YU000jp/logseq-plugin-google-books](https://github.com/YU000jp/logseq-plugin-google-books)
(MIT). See `LICENSE` for attribution.

## What's different from upstream

- **Fixed the broken search.** The Google Books API requires a `country`
  parameter; without it, non-US requests silently return zero results. Added a
  configurable `country` setting (default `US`) plus real error messages that
  distinguish "no results" from rate-limit / network failures.
- **Theme-native UI.** SweetAlert2 removed. The search modal renders with
  Logseq's own theme variables (light/dark/custom), pulled live from the app.
- **Customizable Mustache templates** for the book page, description block, and
  Google Books link — editable in settings, parsed safely back into page
  properties.
- **Local cover storage** under `assets/storages/<plugin-id>/reading-list/`,
  offline-safe; remote thumbnail kept as `cover-src::` fallback.
- **Visual reading-list grid** via the `{{renderer :reading-list}}` macro:
  responsive cover cards with status filter chips (To read / Reading / Read).
- English-only (Japanese i18n / dateutils dependencies removed).

## Install (unpacked)

```bash
npm install
npm run build      # outputs dist/
```

In Logseq: **Settings → Advanced → Developer mode**, then
**Plugins → Load unpacked plugin** → select this folder.

> Built with system Node (aarch64). If `node` on your PATH is an x86-64 nvm
> build it fails with "Exec format error"; use `/usr/bin/node` (Node 22).

## Use

- Click the 📚 toolbar button (or command palette → *Reading List: add a book…*).
- Search by Title / Author / ISBN, or paste many ISBNs in **Bulk ISBN**.
- Click **Add to reading list** on a result, confirm, and the page is created.
- Command palette → *Reading List: open index page* opens the cover grid.
- Change a page's `status::` to `to-read` / `reading` / `read` to move it
  between grid filters; *Reading List: refresh grid* re-queries.

## Rate limits / API key

Keyless Google Books requests are attributed to a single **shared anonymous
project pooled across every keyless caller worldwide**. When that pool is
exhausted you get HTTP 429 *regardless of your own IP* — it is not a per-IP
limit. Fix: create a free API key
(<https://console.cloud.google.com/apis/credentials>, enable the **Books API**)
and paste it into the plugin's **Google Books API key** setting for your own
private quota.

## Settings

`apiKey`, `country`, `saveImage`, `defaultStatus`, `pageNamePrefix`,
`readingListPageName`, `assetsSubfolder`, and three Mustache templates
(`bookPageTemplate`, `descriptionBlockTemplate`, `gbooksLinkTemplate`).
*Reading List: reset templates to defaults* restores the shipped templates.

Template variables: `{{title}}`, `{{author}}`, `{{authorLinked}}`,
`{{publisher}}`, `{{isbn}}`, `{{published}}`, `{{pageCount}}`, `{{cover}}`,
`{{coverSrc}}`, `{{description}}`, `{{infoLink}}`, `{{status}}`.
`status` is always written even if removed from a custom template — the grid
depends on it.

## Credits / prior art

- Forked from [@YU000jp/logseq-plugin-google-books](https://github.com/YU000jp/logseq-plugin-google-books)
- [@LuloDev/logseq-book-fetch](https://github.com/LuloDev/logseq-book-fetch)
- [Google Books API](https://developers.google.com/books/docs/v1/using)
