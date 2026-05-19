import { closeModal, openModal } from './lib'
import { createTable, attachResultHandlers } from './modal'

/**
 * Build a Google Books volumes query URL.
 *
 * The `country` parameter is REQUIRED. Google began enforcing it on this
 * endpoint around 2023; without it, requests from non-US IPs silently
 * return `{ totalItems: 0 }` with no `items` instead of an error — which
 * is exactly the "search works but always no results" bug this fork was
 * created to fix. It is exposed as a setting (default "US").
 */
export const buildApiUrl = (mode: string, value: string): string => {
  const country = (logseq.settings?.country as string)?.trim() || 'US'
  const q = encodeURIComponent(value)
  let prefix = ''
  switch (mode) {
    case 'searchTitle':
      prefix = `intitle:${q}`
      break
    case 'searchISBN':
      prefix = `isbn:${q}`
      break
    case 'searchAuthor':
      prefix = `inauthor:${q}`
      break
    default:
      prefix = q
  }
  const apiKey = (logseq.settings?.apiKey as string)?.trim()
  const keyParam = apiKey ? `&key=${encodeURIComponent(apiKey)}` : ''
  return `https://www.googleapis.com/books/v1/volumes?q=${prefix}&country=${encodeURIComponent(country)}&maxResults=20${keyParam}`
}

const RATE_LIMIT_HINT =
  'Google Books rate limit reached. Keyless requests share one global quota that is often exhausted (this is not your IP). Add a free API key in the plugin settings to use your own quota.'

export const search = async (form: HTMLFormElement) => {
  const input = form.querySelector('input[type="text"]')
  if (!(input instanceof HTMLInputElement)) return
  const inputValue = input.value.trim()
  if (inputValue.length === 0) return

  const output = document.getElementById('outputFromAPI')
  if (output) output.innerHTML = `<p class="lrl-status">Searching…</p>`

  const apiUrl = buildApiUrl(form.id, inputValue)

  try {
    const response = await fetch(apiUrl)
    if (!response.ok) {
      const detail = response.status === 429
        ? RATE_LIMIT_HINT
        : `Google Books request failed (HTTP ${response.status}).`
      if (output) output.innerHTML = `<p class="lrl-status lrl-error">${detail}</p>`
      logseq.UI.showMsg(detail, 'error')
      console.error('logseq-reading-list: search HTTP error', response.status, apiUrl)
      return
    }
    const data = await response.json()
    if (output && Array.isArray(data.items) && data.items.length > 0) {
      output.innerHTML = createTable(data.items)
      attachResultHandlers(closeModal, openModal, data)
    } else {
      if (output) output.innerHTML = `<p class="lrl-status">No matching books found. Try a different title, an author, or an ISBN.</p>`
    }
  } catch (error) {
    const msg = 'Could not reach Google Books (network/CORS). Check your connection.'
    if (output) output.innerHTML = `<p class="lrl-status lrl-error">${msg}</p>`
    logseq.UI.showMsg(msg, 'error')
    console.error('logseq-reading-list: search fetch failed', error)
  }
}
