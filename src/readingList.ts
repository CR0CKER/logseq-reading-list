import '@logseq/libs'
import { PageEntity } from '@logseq/libs/dist/LSPlugin.user'
import { readingListPageName } from './lib'
import { READING_STATUSES } from './render'

const MACRO = ':reading-list'
const STATUS_LABEL: Record<string, string> = {
  'to-read': 'To read',
  reading: 'Reading',
  read: 'Read',
}

interface BookRow {
  pageName: string
  title: string
  author: string
  status: string
  imgSrc: string
  createdAt: number
  /** uuid of the block carrying the `status` property (the write target). */
  uuid: string
}

/** Click-cycle order for the status badge. */
const NEXT_STATUS: Record<string, string> = {
  'to-read': 'reading',
  reading: 'read',
  read: 'to-read',
}

/** Round status-badge glyphs (inline SVG, stroke/fill = currentColor so the
 *  per-status `.lrl-badge-*` colour applies). Ring = to-read, half-filled
 *  ring = reading, check = read. */
const STATUS_ICON: Record<string, string> = {
  'to-read':
    '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><circle cx="12" cy="12" r="8"/></svg>',
  reading:
    '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><circle cx="12" cy="12" r="8"/><path d="M12 4a8 8 0 0 1 0 16Z" fill="currentColor" stroke="none"/></svg>',
  read:
    '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>',
}

// Re-render targets the same slot when a filter chip is clicked.
let lastSlot: string | null = null
let currentFilter = 'all'
let sortMenuOpen = false
/** Viewport coordinates for the sort menu, captured when it's opened.
 *  Using position:fixed bypasses the offset-parent resolution problem
 *  caused by Logseq's positioning contexts on ancestors of our slot. */
let sortMenuTop = 0
let sortMenuRight = 0

/** Sort preference persists across reloads (stored in plugin settings). */
function getSort(): 'added' | 'alpha' {
  return logseq.settings?.lastSort === 'alpha' ? 'alpha' : 'added'
}

function esc(s: string): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/** Get the src out of a `cover` property — either a bare path/URL or a
 *  legacy `![alt](path)` markdown image (used by older book pages). */
function pathFromCover(cover: any): string {
  if (typeof cover !== 'string') return ''
  const m = cover.match(/\]\(([^)]+)\)/)
  return m ? m[1] : cover.trim()
}

async function queryBooks(): Promise<BookRow[]> {
  // Pull any entity (page or content block) with a `status` property,
  // resolving the block's parent page so we can navigate to it. Pages
  // have :block/name/:block/original-name; blocks resolve to their page
  // via :block/page. This makes the query work for the legacy layout
  // (page-level properties) AND the current one (properties on a
  // dedicated content block under the cover).
  const q = `[:find (pull ?b [:block/uuid :block/name :block/original-name :block/properties :block/created-at
                              {:block/page [:block/name :block/original-name :block/created-at]}])
     :where
     [?b :block/properties ?props]
     [(get ?props :status) _]]`
  let rows: any[] = []
  try {
    rows = (await logseq.DB.datascriptQuery(q)) as any[]
  } catch (e) {
    console.error('logseq-reading-list: datascript query failed', e)
    return []
  }

  let graphPath = ''
  try {
    const g = (await logseq.App.getCurrentGraph()) as { path?: string } | null
    graphPath = g?.path || ''
  } catch {
    /* ignore */
  }

  const seenPages = new Set<string>()
  const books: BookRow[] = []
  for (const r of rows) {
    const p = Array.isArray(r) ? r[0] : r
    if (!p) continue
    const props = p['properties'] || p['block/properties'] || {}
    const status = String(props.status || '').toLowerCase()
    if (!(READING_STATUSES as readonly string[]).includes(status)) continue
    // If `p` is a page, the name lives on `p`. If `p` is a content block,
    // `p.page` was resolved in the pull and carries the page name.
    const pageEntity = p['page'] || p['block/page'] || p
    const name =
      pageEntity['original-name'] ||
      pageEntity['block/original-name'] ||
      pageEntity['name'] ||
      pageEntity['block/name']
    if (!name) continue
    if (seenPages.has(String(name))) continue
    seenPages.add(String(name))
    const createdAt = Number(
      pageEntity['created-at'] ||
        pageEntity['block/created-at'] ||
        p['created-at'] ||
        p['block/created-at'] ||
        0,
    )

    // `cover` holds `![cover](<src>)`. http(s)/data URIs work as-is; a
    // relative ../assets/ ref must be made absolute for the plugin-
    // rendered <img> (the page itself resolves it natively).
    let imgSrc = pathFromCover(props.cover)
    if (imgSrc.startsWith('../assets/') && graphPath) {
      imgSrc = `assets://${graphPath}/${imgSrc.replace(/^\.\.\//, '')}`
    }

    books.push({
      createdAt,
      pageName: String(name),
      title: String(name).replace(/^.*\//, ''),
      author: String(props.author || '').replace(/\[\[|\]\]/g, ''),
      status,
      imgSrc,
      uuid: String(p['uuid'] || p['block/uuid'] || ''),
    })
  }
  if (getSort() === 'alpha') {
    books.sort((a, b) => a.title.localeCompare(b.title))
  } else {
    books.sort((a, b) => b.createdAt - a.createdAt || a.title.localeCompare(b.title))
  }
  return books
}

// Inline-style declarations applied to every chip-shaped button. These
// have to sit on the element itself (not in a <style> block) because
// Logseq core appears to aggressively reset button styling inside
// plugin macro slots — even !important author rules can lose to it.
// Inline + !important is the highest origin in the author cascade and
// can't be overridden by any author stylesheet (including Logseq core).
//
// The active variant gets fully solid styling overrides the same way;
// otherwise the .lrl-chip-active CSS rule has the same cascade fight.
const CHIP_INLINE_STYLE =
  'border:1px solid currentColor !important;' +
  'background:transparent !important;' +
  'padding:4px 12px !important;' +
  'border-radius:999px !important;' +
  'display:inline-flex !important;' +
  'align-items:center !important;' +
  'gap:5px !important;' +
  'cursor:pointer !important;'

const CHIP_ACTIVE_INLINE_STYLE =
  'border:1px solid var(--ls-link-text-color, #2563eb) !important;' +
  'background:var(--ls-link-text-color, #2563eb) !important;' +
  'color:#fff !important;' +
  'padding:4px 12px !important;' +
  'border-radius:999px !important;' +
  'display:inline-flex !important;' +
  'align-items:center !important;' +
  'gap:5px !important;' +
  'cursor:pointer !important;'

function chip(status: string, active: boolean): string {
  const label = status === 'all' ? 'All' : STATUS_LABEL[status] || status
  const style = active ? CHIP_ACTIVE_INLINE_STYLE : CHIP_INLINE_STYLE
  return `<button class="lrl-chip${active ? ' lrl-chip-active' : ''}" style="${style}" data-on-click="rlFilter" data-status="${status}">${label}</button>`
}

function card(b: BookRow): string {
  const img = b.imgSrc
    ? `<img class="lrl-cover" src="${esc(b.imgSrc)}" loading="lazy" alt="${esc(b.title)}" onerror="this.style.display='none';this.parentElement.classList.add('lrl-nocover')"/>`
    : ''
  const next = NEXT_STATUS[b.status] || 'to-read'
  const badge = b.uuid
    ? `<button class="lrl-status-badge lrl-badge-${b.status}" data-on-click="rlCycleStatus" data-uuid="${esc(b.uuid)}" data-status="${b.status}" title="${STATUS_LABEL[b.status] || b.status} — click to mark as ${STATUS_LABEL[next] || next}">${STATUS_ICON[b.status] || ''}</button>`
    : ''
  return `<div class="lrl-card" data-on-click="rlOpen" data-page="${esc(b.pageName)}" title="${esc(b.title)}">
    <div class="lrl-cover-wrap lrl-status-${b.status}">${img}<span class="lrl-cover-fallback">${esc(b.title)}</span>${badge}</div>
    <div class="lrl-meta">
      <div class="lrl-title">${esc(b.title)}</div>
      ${b.author ? `<div class="lrl-author">${esc(b.author)}</div>` : ''}
    </div>
  </div>`
}

function gridHtml(books: BookRow[]): string {
  const filtered = currentFilter === 'all' ? books : books.filter((b) => b.status === currentFilter)
  const chips = ['all', ...READING_STATUSES]
    .map((s) => chip(s, s === currentFilter))
    .join('')
  const sort = getSort()
  const sortLabel = sort === 'alpha' ? 'A → Z' : 'Recently added'
  const body = filtered.length
    ? `<div class="lrl-grid">${filtered.map(card).join('')}</div>`
    : `<div class="lrl-empty">No books${currentFilter === 'all' ? ' yet' : ` marked “${STATUS_LABEL[currentFilter] || currentFilter}”`}. Use the Reading List toolbar button to add some.</div>`
  // Position the menu with viewport-fixed coordinates captured from the
  // button when the menu opens. This sidesteps every offset-parent /
  // cascade issue we hit with position:absolute.
  const menu = sortMenuOpen
    ? `<div class="lrl-sort-menu" role="menu" style="position:fixed !important;top:${sortMenuTop}px !important;right:${sortMenuRight}px !important;">
        <button class="lrl-sort-item${sort === 'added' ? ' lrl-sort-active' : ''}" data-on-click="rlSort" data-sort="added">Recently added</button>
        <button class="lrl-sort-item${sort === 'alpha' ? ' lrl-sort-active' : ''}" data-on-click="rlSort" data-sort="alpha">A → Z</button>
      </div>`
    : ''
  return `<div class="lrl-readinglist">
    <div class="lrl-bar">
      <div class="lrl-chips">${chips}</div>
      <div class="lrl-sort" style="display:flex;align-items:center;flex:0 0 auto;">
        <button class="lrl-chip" style="${CHIP_INLINE_STYLE}" data-on-click="rlToggleSortMenu" title="Change sort order">${sortLabel}<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"/></svg></button>
        ${menu}
      </div>
      <button class="lrl-chip" style="${CHIP_INLINE_STYLE}" data-on-click="rlRefresh" title="Refresh">↻</button>
    </div>
    ${body}
  </div>`
}

const GRID_CSS = `
/* Hide the bullet of the block hosting our renderer (Logseq draws a
 * bullet for every block; here the rendered grid is the whole block
 * content, so the bullet is visually noisy). :has() scopes this strictly
 * to the renderer block — child blocks keep their bullets. */
.ls-block:has(> .block-main-container > .block-content-wrapper .lrl-readinglist) > .block-main-container > .block-control-wrap,
.ls-block:has(> div > div .lrl-readinglist) > div > .block-control-wrap { display: none; }

/* Logseq wraps the macro-renderer slot in a chain that includes an
 * inline <span class="inline"> AND a .block-content carrying the
 * .inline class. Inline boxes collapse to content width, so width:100%
 * inside them is ignored — that's what's squashing the grid. Force the
 * relevant ancestors to block layout. Scoped via :has() so this only
 * affects boxes that actually contain our renderer. */
.block-content:has(.lrl-readinglist),
span:has(> .lsp-hook-ui-slot .lrl-readinglist),
.lsp-hook-ui-slot:has(.lrl-readinglist),
.lsp-hook-ui-slot:has(.lrl-readinglist) > [data-injected-ui] { display: block !important; width: 100% !important; max-width: none !important; }

.lrl-readinglist{font-size:14px;width:calc(100% + 4rem);margin-right:-4rem;padding-left:1.5rem;box-sizing:border-box;}
.lrl-bar{display:flex;align-items:center;gap:8px;margin:4px 0 14px;}
.lrl-chips{display:flex;gap:6px;flex-wrap:wrap;flex:1 1 auto;min-width:0;}
/* The grid is rendered into Logseq's *main DOM* (via provideUI), where
 * I can't assume any --ls-* variable is defined: theme.ts only injects
 * those into the plugin iframe. When var(--undefined) has no fallback
 * the entire CSS declaration is invalidated, which is why earlier
 * border attempts collapsed to the UA default (no border at all).
 *
 * Use currentColor (always defined; equals the chip's text colour
 * after Logseq's body inheritance) for the border, and a translucent
 * color-mix of currentColor for the subtle pill background. Both
 * derive from the same property the chip text already uses, so
 * whatever colour Logseq actually renders the text in, the chip is
 * outlined and tinted in a matching, visible variant — works on any
 * theme with no variable dependencies. !important + .lrl-readinglist
 * parent class keep Logseq's <button> reset from winning the cascade. */
.lrl-readinglist .lrl-chip{appearance:none !important;border:1px solid currentColor !important;background:color-mix(in srgb, currentColor 6%, transparent) !important;color:var(--ls-primary-text-color);padding:4px 12px;border-radius:999px;cursor:pointer;font-size:13px;line-height:1.4;display:inline-flex;align-items:center;gap:5px;}
.lrl-readinglist .lrl-chip svg{display:block;}
.lrl-sort{position:relative !important;flex:0 0 auto;}
.lrl-sort-menu{position:absolute !important;right:0 !important;top:calc(100% + 6px) !important;background:var(--ls-primary-background-color);border:1px solid var(--ls-border-color);border-radius:8px;box-shadow:0 6px 22px rgba(0,0,0,.28);min-width:160px;padding:4px;z-index:50;display:flex;flex-direction:column;}
.lrl-sort-item{appearance:none;border:none;background:transparent;color:var(--ls-primary-text-color);text-align:left;padding:7px 12px;border-radius:6px;cursor:pointer;font-size:13px;}
.lrl-sort-item:hover{background:var(--ls-tertiary-background-color);}
.lrl-sort-active{color:var(--ls-link-text-color, var(--ls-active-primary-color, #2563eb));font-weight:600;}
.lrl-readinglist .lrl-chip:hover{background:color-mix(in srgb, currentColor 14%, transparent) !important;}
/* Background falls through link-text → active-primary → a hard-coded
 * blue. Without the final fallback an empty --ls-link-text-color (some
 * light themes don't set it) gives an empty value and the chip renders
 * transparent — white text then disappears on the page background.
 *
 * Duplicate the rule with :hover so it matches the hover specificity
 * and keeps the active fill on hover. Prefixed with .lrl-readinglist
 * + !important so it survives Logseq's button reset. */
.lrl-readinglist .lrl-chip-active,
.lrl-readinglist .lrl-chip-active:hover{background:var(--ls-link-text-color, var(--ls-active-primary-color, #2563eb)) !important;border-color:var(--ls-link-text-color, var(--ls-active-primary-color, #2563eb)) !important;color:#fff !important;}
.lrl-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(110px,1fr));gap:18px;width:100%;}
.lrl-card{cursor:pointer;display:flex;flex-direction:column;gap:6px;}
.lrl-cover-wrap{position:relative;aspect-ratio:2/3;border-radius:8px;overflow:hidden;background:var(--ls-tertiary-background-color);box-shadow:0 1px 6px rgba(0,0,0,.25);display:flex;align-items:center;justify-content:center;}
.lrl-cover{width:100%;height:100%;object-fit:cover;display:block;}
.lrl-cover-fallback{display:none;padding:8px;text-align:center;font-size:12px;color:var(--ls-secondary-text-color);}
.lrl-cover-wrap.lrl-nocover .lrl-cover-fallback{display:block;}
.lrl-card:hover .lrl-cover-wrap{outline:2px solid var(--ls-link-text-color);}
/* Cycling status badge, top-right of the cover. Hover-only: hidden at rest
 * so the grid stays uncluttered, fades in while the card is hovered. Inline
 * + .lrl-readinglist-scoped !important to survive Logseq's button reset in
 * the main DOM. Glyph colour comes from the color property (SVG uses
 * currentColor). */
.lrl-readinglist .lrl-status-badge{appearance:none !important;position:absolute !important;top:6px;right:6px;width:26px;height:26px;padding:0 !important;border:none !important;border-radius:999px !important;background:rgba(0,0,0,.55) !important;display:flex !important;align-items:center;justify-content:center;cursor:pointer;z-index:2;opacity:0;pointer-events:none;transition:opacity .12s ease, transform .12s ease;box-shadow:0 1px 4px rgba(0,0,0,.35);}
.lrl-readinglist .lrl-status-badge svg{display:block;}
.lrl-card:hover .lrl-status-badge{opacity:1;pointer-events:auto;}
.lrl-readinglist .lrl-status-badge:hover{transform:scale(1.12);background:rgba(0,0,0,.7) !important;}
.lrl-readinglist .lrl-badge-to-read{color:var(--ls-secondary-text-color, #9ca3af) !important;}
.lrl-readinglist .lrl-badge-reading{color:#f59e0b !important;}
.lrl-readinglist .lrl-badge-read{color:#22c55e !important;}
.lrl-meta{display:flex;flex-direction:column;gap:1px;}
.lrl-title{font-weight:600;color:var(--ls-primary-text-color);line-height:1.25;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;}
.lrl-author{color:var(--ls-secondary-text-color);font-size:12px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
.lrl-empty{color:var(--ls-secondary-text-color);padding:18px 0;}
`

async function renderInto(slot: string): Promise<void> {
  lastSlot = slot
  const books = await queryBooks()
  logseq.provideStyle({ key: 'lrl-grid-style', style: GRID_CSS })
  logseq.provideUI({
    key: 'lrl-grid',
    slot,
    reset: true,
    template: gridHtml(books),
  })
}

export function registerReadingListMacro(): void {
  // The optional mobile table (see insertMobileTable) lives on the same page
  // as the grid. The grid is a desktop-only plugin renderer, so on desktop we
  // hide the native table to avoid duplication. This style is only injected
  // when the plugin runs (desktop); on the mobile app the plugin never loads,
  // so the rule is absent and the table shows. `:has()` is already used in
  // GRID_CSS and is available in Logseq's Electron Chromium.
  logseq.provideStyle({
    key: 'lrl-mobile-hide',
    style: '.ls-block:has(a.tag[data-ref="reading-list-mobile"]){display:none !important;}',
  })

  logseq.App.onMacroRendererSlotted(async ({ slot, payload }) => {
    const args = payload?.arguments ?? []
    if (!args[0] || String(args[0]).trim() !== MACRO) return
    const arg = (args[1] || '').toString().trim().toLowerCase()
    if ((READING_STATUSES as readonly string[]).includes(arg) || arg === 'all') {
      currentFilter = arg
    }
    await renderInto(slot)
  })
}

/** Model handlers wired through logseq.provideModel (merged in index.ts). */
export const readingListModel = {
  async rlFilter(e: any) {
    currentFilter = e?.dataset?.status || 'all'
    if (lastSlot) await renderInto(lastSlot)
  },
  async rlRefresh() {
    if (lastSlot) await renderInto(lastSlot)
  },
  async rlToggleSortMenu(e: any) {
    if (!sortMenuOpen) {
      // Capture the click target's bounding rect in viewport coordinates.
      // `e` here is the event-payload Logseq hands to provideModel
      // handlers; on click events it carries a synthetic target reference.
      // We read from parent.document directly to be safe across builds.
      try {
        const btn = parent.document.querySelector(
          '.lrl-sort .lrl-chip[data-on-click="rlToggleSortMenu"]',
        ) as HTMLElement | null
        if (btn) {
          const r = btn.getBoundingClientRect()
          sortMenuTop = Math.round(r.bottom + 6)
          sortMenuRight = Math.round(parent.innerWidth - r.right)
        }
      } catch {
        sortMenuTop = 60
        sortMenuRight = 16
      }
    }
    sortMenuOpen = !sortMenuOpen
    if (lastSlot) await renderInto(lastSlot)
  },
  async rlSort(e: any) {
    const next = e?.dataset?.sort
    if (next === 'added' || next === 'alpha') {
      logseq.updateSettings({ lastSort: next })
      sortMenuOpen = false
      if (lastSlot) await renderInto(lastSlot)
    }
  },
  rlOpen(e: any) {
    const name = e?.dataset?.page
    if (name) logseq.App.pushState('page', { name })
  },
  async rlCycleStatus(e: any) {
    const uuid = e?.dataset?.uuid
    const cur = e?.dataset?.status
    if (!uuid) return
    const next = NEXT_STATUS[cur] || 'to-read'
    try {
      await logseq.Editor.upsertBlockProperty(uuid, 'status', next)
    } catch (err) {
      console.error('logseq-reading-list: failed to set status', err)
      return
    }
    if (lastSlot) await renderInto(lastSlot)
  },
}

const SEED_INTRO =
  'Your visual reading list. Each cover links to its book page; change a page\'s `status::` to `to-read` / `reading` / `read` to move it between filters.'

export const ensureReadingListIndex = async (): Promise<void> => {
  const pageName = readingListPageName()
  let page = (await logseq.Editor.getPage(pageName)) as PageEntity | null
  if (!page) {
    page = (await logseq.Editor.createPage(
      pageName,
      {},
      { redirect: false, createFirstBlock: true },
    )) as PageEntity | null
  }
  if (!page) return
  const tree = await logseq.Editor.getPageBlocksTree(pageName)
  const hasRenderer = (tree || []).some((b: any) => (b.content || '').includes(`{{renderer ${MACRO}`))
  if (hasRenderer) return
  // Fresh / empty index page: seed intro + the grid renderer.
  if (tree && tree[0] && !(tree[0].content || '').trim()) {
    await logseq.Editor.updateBlock(tree[0].uuid, SEED_INTRO)
    await logseq.Editor.insertBlock(tree[0].uuid, `{{renderer ${MACRO}}}`, { sibling: true })
  } else {
    await logseq.Editor.appendBlockInPage(pageName, SEED_INTRO)
    await logseq.Editor.appendBlockInPage(pageName, `{{renderer ${MACRO}}}`)
  }
}

/** CSS hook for the optional mobile-friendly view. */
const MOBILE_MARKER = 'reading-list-mobile'

/**
 * Native simple query, configured as a property table. Simple queries render
 * reliably on the Logseq mobile app (where plugins don't run); custom advanced
 * `:view` hiccup does not and throws "invalid query" there, so we stay simple.
 *
 * `(property status)` matches every book block by the presence of its status
 * property — cleaner than an `(or …)` of each value (which renders as bulky
 * DSL chips). The `query-*` config lives in the block content (raw EDN) so the
 * column list actually applies; passing it via insertBlock's properties option
 * stringifies the vector and Logseq silently ignores it.
 */
const MOBILE_QUERY = `{{query (property status)}}
query-table:: true
query-properties:: [:page :status :author]
query-sort-by:: status`

/**
 * Add a native Logseq query table to the Reading List page. Unlike the grid
 * (a desktop-only plugin renderer), this is a plain `{{query}}` block that
 * Logseq renders on every platform — including the mobile app, where plugins
 * don't run. On desktop it's hidden via the `lrl-mobile-hide` style so it
 * doesn't duplicate the grid; on mobile that style is absent and it shows.
 *
 * The block is tagged `#reading-list-mobile` (the CSS hook) and pre-configured
 * with query-table columns so the user doesn't have to touch the gear menu.
 */
export const insertMobileTable = async (): Promise<void> => {
  await ensureReadingListIndex()
  const pageName = readingListPageName()
  const tree = await logseq.Editor.getPageBlocksTree(pageName)
  const exists = (tree || []).some((b: any) => (b.content || '').includes(`#${MOBILE_MARKER}`))
  if (exists) {
    await logseq.UI.showMsg('A mobile reading-list table is already on this page.', 'info')
    return
  }
  const parent = await logseq.Editor.appendBlockInPage(pageName, `#${MOBILE_MARKER}`)
  if (!parent) {
    await logseq.UI.showMsg('Could not add the mobile table.', 'error')
    return
  }
  await logseq.Editor.insertBlock(parent.uuid, MOBILE_QUERY, { sibling: false })
  await logseq.UI.showMsg(
    'Mobile reading-list table added. It is hidden on desktop and shows in the Logseq mobile app.',
    'success',
    { timeout: 6000 },
  )
}
