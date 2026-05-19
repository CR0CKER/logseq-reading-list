import { PageEntity } from '@logseq/libs/dist/LSPlugin.user'
import { fetchCoverDataUri } from './toAssets'
import { ensureReadingListIndex } from './readingList'
import { BookResult, fetchDescription } from './providers'
import {
  BookView,
  DEFAULT_DESCRIPTION_BLOCK_TEMPLATE,
  DEFAULT_GBOOKS_LINK_TEMPLATE,
  READING_STATUSES,
  ReadingStatus,
  renderBlock,
  renderBookPageProperties,
  sanitiseForWikilink,
  sanitisePropertyValue,
  truncate,
} from './render'

function defaultStatus(): ReadingStatus {
  const s = logseq.settings?.defaultStatus as string
  return (READING_STATUSES as readonly string[]).includes(s) ? (s as ReadingStatus) : 'to-read'
}

export const createBookPage = async (book: BookResult, fullTitle: string) => {
  const description = await fetchDescription(book)

  // Preferred: a genuinely-local base64 cover embedded in the property.
  // Fallback: the remote URL. Either way, one `cover` property only.
  let coverSrc = ''
  if (book.thumbnail && logseq.settings?.saveImage === true) {
    coverSrc = await fetchCoverDataUri(book.thumbnail)
  }
  if (!coverSrc && book.thumbnail) coverSrc = book.thumbnail
  const cover = coverSrc ? `![cover](${coverSrc})` : ''

  const cleanAuthors = book.authors.map((a) => sanitisePropertyValue(a)).filter(Boolean)
  const view: BookView = {
    title: sanitisePropertyValue(book.title),
    fullTitle,
    author: cleanAuthors.join(', '),
    authorLinked: cleanAuthors.map((a) => `[[${sanitiseForWikilink(a)}]]`).join(', '),
    publisher: sanitisePropertyValue(book.publisher),
    isbn: book.isbn,
    published: book.publishedDate,
    pageCount: book.pageCount,
    description: truncate(sanitisePropertyValue(description)),
    cover,
    coverSrc: book.thumbnail,
    infoLink: book.infoLink,
    status: defaultStatus(),
  }

  const properties = renderBookPageProperties(view, logseq.settings?.bookPageTemplate as string)

  const page = (await logseq.Editor.createPage(fullTitle, properties, {
    redirect: true,
    createFirstBlock: true,
  })) as PageEntity | null

  if (!page) {
    logseq.UI.showMsg('Failed to create page: ' + fullTitle, 'error')
    console.error('logseq-reading-list: createPage returned null for', fullTitle)
    return
  }

  await new Promise((r) => setTimeout(r, 120))

  const linkBlock = renderBlock(
    logseq.settings?.gbooksLinkTemplate as string,
    DEFAULT_GBOOKS_LINK_TEMPLATE,
    view,
  )
  if (linkBlock) await logseq.Editor.prependBlockInPage(page.uuid, linkBlock)

  const descBlock = renderBlock(
    logseq.settings?.descriptionBlockTemplate as string,
    DEFAULT_DESCRIPTION_BLOCK_TEMPLATE,
    view,
  )
  if (descBlock) await logseq.Editor.prependBlockInPage(page.uuid, descBlock)

  await ensureReadingListIndex()

  console.log('logseq-reading-list: created book page', fullTitle)
  logseq.UI.showMsg('Page created: ' + fullTitle, 'success', { timeout: 4200 })
}
