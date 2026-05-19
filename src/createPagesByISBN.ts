import { PageEntity } from '@logseq/libs/dist/LSPlugin.user'
import { createBookPage } from './createBookPage'
import { bookPageName } from './lib'
import { buildApiUrl } from './search'

export const createPagesByISBN = async (form: HTMLFormElement): Promise<void> => {
  const textarea = form.querySelector('textarea')
  if (!(textarea instanceof HTMLTextAreaElement)) return
  const isbnCodes = textarea.value.trim().split('\n')
  if (isbnCodes.length === 0) return
  const isbnCodesFiltered = isbnCodes
    .map((s) => s.trim().replace(/-/g, ''))
    .filter((isbn) => isbn.match(/^[0-9]{10,13}$/))
  if (isbnCodesFiltered.length === 0) {
    logseq.UI.showMsg('No valid 10- or 13-digit ISBN codes found.', 'warning')
    return
  }

  const existPages: string[] = []
  const notFoundPages: string[] = []

  for (let i = 0; i < isbnCodesFiltered.length; i++) {
    const code = isbnCodesFiltered[i]
    console.log('logseq-reading-list: bulk fetch ISBN', code)
    try {
      const response = await fetch(buildApiUrl('searchISBN', code))
      if (!response.ok) {
        if (response.status === 429) {
          logseq.UI.showMsg(
            'Google Books rate limit reached (shared keyless quota, not your IP) — stopping bulk import. Add a free API key in settings.',
            'error',
          )
          break
        }
        notFoundPages.push(code)
      } else {
        const data = await response.json()
        if (Array.isArray(data.items) && data.items.length > 0) {
          const selectedTitle = data.items[0].volumeInfo.title.replaceAll('/', ' ')
          const fullTitle = bookPageName(selectedTitle)
          const exists = (await logseq.Editor.getPage(fullTitle)) as
            | { uuid: PageEntity['uuid'] }
            | null
          if (exists) {
            existPages.push(fullTitle)
          } else {
            await createBookPage(data, selectedTitle, fullTitle)
            await new Promise((r) => setTimeout(r, 3300))
          }
        } else {
          notFoundPages.push(code)
        }
      }
    } catch (error) {
      console.error('logseq-reading-list: bulk ISBN error', code, error)
      notFoundPages.push(code)
    }
    await new Promise((r) => setTimeout(r, 2000))
  }

  if (existPages.length > 0 || notFoundPages.length > 0) {
    logseq.UI.showMsg(
      `Already existed (${existPages.length}):\n${existPages.join('\n')}\n` +
        `Not found (${notFoundPages.length}):\n${notFoundPages.join('\n')}`,
      'warning',
      { timeout: 12000 },
    )
  }
}
