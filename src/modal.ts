import { PageEntity } from '@logseq/libs/dist/LSPlugin.user'
import { createBookPage } from './createBookPage'
import { createPagesByISBN } from './createPagesByISBN'
import { bookPageName, setCloseButton, setMainUIApp, setReadingPageButton } from './lib'
import { search } from './search'
import { BookResult, currentSource } from './providers'
import { applyTheme } from './theme'

const MODES: { id: string; label: string; placeholder: string }[] = [
  { id: 'searchTitle', label: 'Title', placeholder: 'Book title or keywords…' },
  { id: 'searchAuthor', label: 'Author', placeholder: 'Author name…' },
  { id: 'searchISBN', label: 'ISBN', placeholder: '10- or 13-digit ISBN' },
  { id: 'inputISBN', label: 'Bulk ISBN', placeholder: 'One ISBN per line' },
]

function escAttr(s: any): string {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;')
}

/* on click open_toolbar — registered via logseq.provideModel */
export const model = {
  async OpenToolbarGoogle() {
    await applyTheme()

    const segments = MODES.map(
      (m, i) =>
        `<button type="button" class="lrl-seg${i === 0 ? ' lrl-seg-active' : ''}" data-mode="${m.id}">${m.label}</button>`,
    ).join('')
    const sourceLabel = currentSource() === 'google' ? 'Google Books' : 'Open Library'

    const appHtml = `
      <dialog id="appDialog" class="lrl-dialog">
        <div class="lrl-head">
          <h1>Reading List — Add a book</h1>
          <button id="closeBtn" class="lrl-iconbtn" title="Close">✕</button>
        </div>
        <div class="lrl-segments">${segments}</div>
        <form id="lrlSearchForm" autocomplete="off">
          <div class="lrl-inputrow">
            <input type="text" id="lrlInput" placeholder="${MODES[0].placeholder}" required/>
            <textarea id="lrlTextarea" placeholder="One ISBN per line" style="display:none"></textarea>
            <button type="submit" class="lrl-primary">Search</button>
          </div>
        </form>
        <output aria-live="polite" id="outputFromAPI"></output>
        <div class="lrl-foot">
          <span class="lrl-source">Source: ${sourceLabel}</span>
          <button id="ReadingBtn" class="lrl-link">Open Reading List ↗</button>
        </div>
        <div id="lrlConfirm" class="lrl-confirm" style="display:none"></div>
      </dialog>`

    setMainUIApp(appHtml)
    setCloseButton()
    setReadingPageButton()
    wireModal()
  },
}

let currentMode = 'searchTitle'

function wireModal() {
  const form = document.getElementById('lrlSearchForm') as HTMLFormElement | null
  const input = document.getElementById('lrlInput') as HTMLInputElement | null
  const textarea = document.getElementById('lrlTextarea') as HTMLTextAreaElement | null
  if (!form || !input || !textarea) return

  for (const seg of document.querySelectorAll('.lrl-seg')) {
    seg.addEventListener('click', () => {
      currentMode = (seg as HTMLElement).dataset.mode || 'searchTitle'
      for (const s of document.querySelectorAll('.lrl-seg')) s.classList.remove('lrl-seg-active')
      seg.classList.add('lrl-seg-active')
      const mode = MODES.find((m) => m.id === currentMode)!
      const bulk = currentMode === 'inputISBN'
      input.style.display = bulk ? 'none' : ''
      input.required = !bulk
      textarea.style.display = bulk ? '' : 'none'
      if (!bulk) input.placeholder = mode.placeholder
      const out = document.getElementById('outputFromAPI')
      if (out) out.innerHTML = ''
      ;(bulk ? textarea : input).focus()
    })
  }

  form.addEventListener('submit', async (event) => {
    event.preventDefault()
    if (currentMode === 'inputISBN') {
      const msg = await logseq.UI.showMsg('Bulk creating from ISBN codes…', 'info', {
        timeout: 1000 * 60 * 5,
      })
      await createPagesByISBN(textarea.value)
      logseq.UI.closeMsg(msg)
      logseq.UI.showMsg('Bulk import finished.', 'success', { timeout: 3200 })
    } else {
      await search({
        id: currentMode,
        querySelector: (sel: string) =>
          sel.includes('text') ? input : form.querySelector(sel),
      } as unknown as HTMLFormElement)
    }
  })

  input.focus()
}

/** Result cards for the search output area. */
export const createTable = (results: BookResult[]): string => {
  let cards = ''
  results.forEach((b, i) => {
    const img = b.thumbnail
      ? `<img src="${escAttr(b.thumbnail)}" alt="" loading="lazy" onerror="this.parentElement.innerHTML='<div class=&quot;lrl-noimg&quot;>No cover</div>'"/>`
      : `<div class="lrl-noimg">No cover</div>`
    const title = escAttr((b.title || '').slice(0, 90))
    const author = b.authors.length ? escAttr(b.authors.join(', ')) : ''
    const meta = [b.publisher, b.publishedDate].filter(Boolean).join(' · ')
    cards += `
      <li class="lrl-result">
        <div class="lrl-result-cover">${img}</div>
        <div class="lrl-result-body">
          <div class="lrl-result-title">${title}</div>
          ${author ? `<div class="lrl-result-author">${author}</div>` : ''}
          ${meta ? `<div class="lrl-result-meta">${escAttr(meta)}</div>` : ''}
          <div class="lrl-result-actions">
            <button class="lrl-add lrl-primary" data-index="${i}">Add to reading list</button>
            ${b.infoLink ? `<a href="${escAttr(b.infoLink)}" target="_blank" class="lrl-link">Details ↗</a>` : ''}
          </div>
        </div>
      </li>`
  })
  return `<h2 class="lrl-results-h">Results</h2><ul class="lrl-results">${cards}</ul>`
}

/** Wire the per-result "Add" buttons (called by search.ts after render). */
export const attachResultHandlers = (
  closeFn: () => void,
  _openFn: () => void,
  results: BookResult[],
) => {
  const buttons = document.querySelectorAll('.lrl-add')
  let first = true
  for (const btn of buttons) {
    if (first) {
      ;(btn as HTMLElement).focus()
      first = false
    }
    btn.addEventListener('click', async (event) => {
      event.preventDefault()
      const idx = Number((btn as HTMLElement).dataset.index)
      const book = results[idx]
      if (!book) return
      const fullTitle = bookPageName(book.title)
      const exists = (await logseq.Editor.getPage(fullTitle)) as
        | { uuid: PageEntity['uuid'] }
        | null
      if (exists) {
        logseq.UI.showMsg(`Page already exists: ${fullTitle}`, 'warning')
        return
      }
      const ok = await inlineConfirm(`Create the book page [[${fullTitle}]]?`)
      if (!ok) return
      closeFn()
      logseq.hideMainUI()
      await createBookPage(book, fullTitle)
    })
  }
}

/** Themed in-modal confirm — replaces SweetAlert2. */
function inlineConfirm(message: string): Promise<boolean> {
  return new Promise((resolve) => {
    const box = document.getElementById('lrlConfirm')
    if (!box) return resolve(true)
    box.innerHTML = `
      <div class="lrl-confirm-card">
        <p>${message}</p>
        <div class="lrl-confirm-actions">
          <button class="lrl-ghost" data-act="cancel">Cancel</button>
          <button class="lrl-primary" data-act="ok">Create page</button>
        </div>
      </div>`
    box.style.display = 'flex'
    const done = (v: boolean) => {
      box.style.display = 'none'
      box.innerHTML = ''
      resolve(v)
    }
    box.querySelector('[data-act="ok"]')?.addEventListener('click', () => done(true))
    box.querySelector('[data-act="cancel"]')?.addEventListener('click', () => done(false))
  })
}
