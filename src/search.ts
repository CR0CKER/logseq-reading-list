import { closeModal, openModal } from './lib'
import { createTable, attachResultHandlers } from './modal'
import { SearchMode, searchBooks } from './providers'

const MODE_MAP: Record<string, SearchMode> = {
  searchTitle: 'title',
  searchAuthor: 'author',
  searchISBN: 'isbn',
}

export const search = async (form: HTMLFormElement) => {
  const input = form.querySelector('input[type="text"]')
  if (!(input instanceof HTMLInputElement)) return
  const inputValue = input.value.trim()
  if (inputValue.length === 0) return

  const output = document.getElementById('outputFromAPI')
  if (output) output.innerHTML = `<p class="lrl-status">Searching…</p>`

  const mode = MODE_MAP[form.id] || 'title'
  const outcome = await searchBooks(mode, inputValue)

  if (!outcome.ok) {
    if (output) output.innerHTML = `<p class="lrl-status lrl-error">${outcome.error}</p>`
    logseq.UI.showMsg(outcome.error, 'error')
    console.error('logseq-reading-list: search error', outcome)
    return
  }

  if (output && outcome.results.length > 0) {
    output.innerHTML = createTable(outcome.results)
    attachResultHandlers(closeModal, openModal, outcome.results)
  } else if (output) {
    output.innerHTML = `<p class="lrl-status">No matching books found. Try a different title, an author, or an ISBN.</p>`
  }
}
