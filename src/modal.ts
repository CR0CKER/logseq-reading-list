import { PageEntity } from '@logseq/libs/dist/LSPlugin.user'
import { createBookPage } from './createBookPage'
import { createPagesByISBN } from './createPagesByISBN'
import { bookPageName, closeModal, openModal, setCloseButton, setMainUIApp, setReadingPageButton } from './lib'
import { search } from './search'
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
      // createPagesByISBN reads a textarea inside the given form-like element.
      await createPagesByISBN({ querySelector: () => textarea } as unknown as HTMLFormElement)
      logseq.UI.closeMsg(msg)
      logseq.UI.showMsg('Bulk import finished.', 'success', { timeout: 3200 })
    } else {
      // search() reads form.id and form input[type=text]; adapt our single form.
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
export const createTable = (items: any[]): string => {
  let cards = ''
  for (const item of items) {
    const vi = item.volumeInfo ?? {}
    const img = vi.imageLinks?.thumbnail
      ? `<img src="${escAttr(vi.imageLinks.thumbnail)}" alt=""/>`
      : `<div class="lrl-noimg">No cover</div>`
    const title = escAttr((vi.title || '').slice(0, 90))
    const author = vi.authors ? escAttr([].concat(vi.authors).join(', ')) : ''
    const meta = [vi.publisher, vi.publishedDate].filter(Boolean).join(' · ')
    cards += `
      <li class="lrl-result">
        <div class="lrl-result-cover">${img}</div>
        <div class="lrl-result-body">
          <div class="lrl-result-title">${title}</div>
          ${author ? `<div class="lrl-result-author">${author}</div>` : ''}
          ${meta ? `<div class="lrl-result-meta">${escAttr(meta)}</div>` : ''}
          <div class="lrl-result-actions">
            <button class="lrl-add lrl-primary" data-title="${escAttr((vi.title || '').replaceAll('/', ' '))}">Add to reading list</button>
            ${vi.infoLink ? `<a href="${escAttr(vi.infoLink)}" target="_blank" class="lrl-link">Google Books ↗</a>` : ''}
          </div>
        </div>
      </li>`
  }
  return `<h2 class="lrl-results-h">Results</h2><ul class="lrl-results">${cards}</ul>`
}

/** Wire the per-result "Add" buttons (called by search.ts after render). */
export const attachResultHandlers = (
  closeFn: () => void,
  openFn: () => void,
  data: any,
) => {
  const buttons = document.querySelectorAll('.lrl-add')
  let idx = 0
  for (const btn of buttons) {
    if (idx === 0) (btn as HTMLElement).focus()
    idx++
    btn.addEventListener('click', async (event) => {
      event.preventDefault()
      const selectedTitle = (btn as HTMLElement).dataset.title || ''
      const fullTitle = bookPageName(selectedTitle)
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
      await createBookPage(data, selectedTitle, fullTitle)
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

// Kept for compatibility with the previous export name used elsewhere.
export const choiceRadioButton = (
  _radio: Element,
  closeFn: () => void,
  openFn: () => void,
  data: any,
) => attachResultHandlers(closeFn, openFn, data)
