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
}

// Re-render targets the same slot when a filter chip is clicked.
let lastSlot: string | null = null
let currentFilter = 'all'

function esc(s: string): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/** Pull the path out of a `![alt](path)` markdown cover property. */
function pathFromCover(cover: any): string {
  const m = typeof cover === 'string' ? cover.match(/\]\(([^)]+)\)/) : null
  return m ? m[1] : ''
}

async function queryBooks(): Promise<BookRow[]> {
  const q = `[:find (pull ?p [:block/name :block/original-name :block/properties])
     :where
     [?p :block/properties ?props]
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

  const books: BookRow[] = []
  for (const r of rows) {
    const p = Array.isArray(r) ? r[0] : r
    if (!p) continue
    const props = p['properties'] || p['block/properties'] || {}
    const status = String(props.status || '').toLowerCase()
    if (!(READING_STATUSES as readonly string[]).includes(status)) continue
    const name = p['original-name'] || p['block/original-name'] || p['name'] || p['block/name']
    if (!name) continue

    // `cover` holds `![cover](<src>)`. http(s)/data URIs work as-is; a
    // relative ../assets/ ref must be made absolute for the plugin-
    // rendered <img> (the page itself resolves it natively).
    let imgSrc = pathFromCover(props.cover)
    if (imgSrc.startsWith('../assets/') && graphPath) {
      imgSrc = `assets://${graphPath}/${imgSrc.replace(/^\.\.\//, '')}`
    }

    books.push({
      pageName: String(name),
      title: String(name).replace(/^.*\//, ''),
      author: String(props.author || '').replace(/\[\[|\]\]/g, ''),
      status,
      imgSrc,
    })
  }
  books.sort((a, b) => a.title.localeCompare(b.title))
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
  const body = filtered.length
    ? `<div class="lrl-grid">${filtered.map(card).join('')}</div>`
    : `<div class="lrl-empty">No books${currentFilter === 'all' ? ' yet' : ` marked “${STATUS_LABEL[currentFilter] || currentFilter}”`}. Use the Reading List toolbar button to add some.</div>`
  return `<div class="lrl-readinglist">
    <div class="lrl-bar">
      <div class="lrl-chips">${chips}</div>
      <button class="lrl-chip" data-on-click="rlRefresh" title="Refresh">↻</button>
    </div>
    ${body}
  </div>`
}

const GRID_CSS = `
.lrl-readinglist{font-size:14px;}
.lrl-bar{display:flex;align-items:center;justify-content:space-between;gap:8px;margin:4px 0 14px;flex-wrap:wrap;}
.lrl-chips{display:flex;gap:6px;flex-wrap:wrap;}
.lrl-chip{appearance:none;border:1px solid var(--ls-border-color);background:var(--ls-secondary-background-color);color:var(--ls-primary-text-color);padding:4px 12px;border-radius:999px;cursor:pointer;font-size:13px;line-height:1.4;}
.lrl-chip:hover{background:var(--ls-tertiary-background-color);}
.lrl-chip-active{background:var(--ls-active-primary-color);border-color:var(--ls-active-primary-color);color:#fff;}
.lrl-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(118px,1fr));gap:18px;}
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
