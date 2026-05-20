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
  const q = `[:find (pull ?b [:block/name :block/original-name :block/properties :block/created-at
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
    })
  }
  if (getSort() === 'alpha') {
    books.sort((a, b) => a.title.localeCompare(b.title))
  } else {
    books.sort((a, b) => b.createdAt - a.createdAt || a.title.localeCompare(b.title))
  }
  return books
}

function chip(status: string, active: boolean): string {
  const label = status === 'all' ? 'All' : STATUS_LABEL[status] || status
  return `<button class="lrl-chip${active ? ' lrl-chip-active' : ''}" data-on-click="rlFilter" data-status="${status}">${label}</button>`
}

function card(b: BookRow): string {
  const img = b.imgSrc
    ? `<img class="lrl-cover" src="${esc(b.imgSrc)}" loading="lazy" alt="${esc(b.title)}" onerror="this.style.display='none';this.parentElement.classList.add('lrl-nocover')"/>`
    : ''
  return `<div class="lrl-card" data-on-click="rlOpen" data-page="${esc(b.pageName)}" title="${esc(b.title)}">
    <div class="lrl-cover-wrap lrl-status-${b.status}">${img}<span class="lrl-cover-fallback">${esc(b.title)}</span></div>
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
      <div class="lrl-sort" style="flex:0 0 auto;">
        <button class="lrl-chip" data-on-click="rlToggleSortMenu" title="Change sort order">${sortLabel}<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"/></svg></button>
        ${menu}
      </div>
      <button class="lrl-chip" data-on-click="rlRefresh" title="Refresh">↻</button>
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
.lrl-chip{appearance:none;border:1px solid var(--ls-border-color);background:var(--ls-secondary-background-color);color:var(--ls-primary-text-color);padding:4px 12px;border-radius:999px;cursor:pointer;font-size:13px;line-height:1.4;display:inline-flex;align-items:center;gap:5px;}
.lrl-chip svg{display:block;}
.lrl-sort{position:relative !important;flex:0 0 auto;}
.lrl-sort-menu{position:absolute !important;right:0 !important;top:calc(100% + 6px) !important;background:var(--ls-primary-background-color);border:1px solid var(--ls-border-color);border-radius:8px;box-shadow:0 6px 22px rgba(0,0,0,.28);min-width:160px;padding:4px;z-index:50;display:flex;flex-direction:column;}
.lrl-sort-item{appearance:none;border:none;background:transparent;color:var(--ls-primary-text-color);text-align:left;padding:7px 12px;border-radius:6px;cursor:pointer;font-size:13px;}
.lrl-sort-item:hover{background:var(--ls-tertiary-background-color);}
.lrl-sort-active{color:var(--ls-active-primary-color);font-weight:600;}
.lrl-chip:hover{background:var(--ls-tertiary-background-color);}
.lrl-chip-active{background:var(--ls-active-primary-color);border-color:var(--ls-active-primary-color);color:#fff;}
.lrl-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(110px,1fr));gap:18px;width:100%;}
.lrl-card{cursor:pointer;display:flex;flex-direction:column;gap:6px;}
.lrl-cover-wrap{position:relative;aspect-ratio:2/3;border-radius:8px;overflow:hidden;background:var(--ls-tertiary-background-color);box-shadow:0 1px 6px rgba(0,0,0,.25);display:flex;align-items:center;justify-content:center;}
.lrl-cover{width:100%;height:100%;object-fit:cover;display:block;}
.lrl-cover-fallback{display:none;padding:8px;text-align:center;font-size:12px;color:var(--ls-secondary-text-color);}
.lrl-cover-wrap.lrl-nocover .lrl-cover-fallback{display:block;}
.lrl-card:hover .lrl-cover-wrap{outline:2px solid var(--ls-active-primary-color);}
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
