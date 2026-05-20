import { PageEntity } from '@logseq/libs/dist/LSPlugin.user'
import { createBookPage } from './createBookPage'
import { bookPageName } from './lib'
import { searchBooks } from './providers'

export const createPagesByISBN = async (raw: string): Promise<void> => {
  const isbnCodes = (raw || '').trim().split('\n')
  const isbnCodesFiltered = isbnCodes
    .map((s) => s.trim().replace(/-/g, ''))
    .filter((isbn) => isbn.match(/^[0-9]{10,13}$/))
  if (isbnCodesFiltered.length === 0) {
    logseq.UI.showMsg('No valid 10- or 13-digit ISBN codes found.', 'warning')
    return
  }

  const existPages: string[] = []
  const notFoundPages: string[] = []

  for (const code of isbnCodesFiltered) {
    console.log('logseq-reading-list: bulk fetch ISBN', code)
    const outcome = await searchBooks('isbn', code)
    if (!outcome.ok) {
      if (outcome.status === 429) {
        logseq.UI.showMsg(outcome.error, 'error')
        break
      }
      notFoundPages.push(code)
    } else if (outcome.results.length > 0) {
      const book = outcome.results[0]
      const fullTitle = bookPageName(book.title)
      const exists = (await logseq.Editor.getPage(fullTitle)) as
        | { uuid: PageEntity['uuid'] }
        | null
      if (exists) {
        existPages.push(fullTitle)
      } else {
        await createBookPage(book, fullTitle)
        await new Promise((r) => setTimeout(r, 1200))
      }
    } else {
      notFoundPages.push(code)
    }
    await new Promise((r) => setTimeout(r, 800))
  }

  if (existPages.length > 0 || notFoundPages.length > 0) {
    // If any ISBN collided with an existing page, those books were NOT
    // added — make that clear with error severity. Reading List won't
    // overwrite pages another plugin (or the user) created.
    const parts: string[] = []
    if (existPages.length > 0)
      parts.push(
        `Skipped because a page already exists (${existPages.length}) — not added:\n` +
          existPages.join('\n'),
      )
    if (notFoundPages.length > 0)
      parts.push(`Not found in the book service (${notFoundPages.length}):\n` + notFoundPages.join('\n'))
    logseq.UI.showMsg(parts.join('\n\n'), existPages.length > 0 ? 'error' : 'warning', {
      timeout: 12000,
    })
  }
}
