import { PageEntity } from '@logseq/libs/dist/LSPlugin.user'
import { saveCoverAsset } from './toAssets'
import { ensureReadingListIndex } from './readingList'
import { BookResult, fetchDescription } from './providers'
import {
  BookView,
  DEFAULT_COVER_BLOCK_TEMPLATE,
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

function slugify(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'book'
}

export const createBookPage = async (book: BookResult, fullTitle: string) => {
  const description = await fetchDescription(book)

  // Preferred: a real local asset file (short, editable ref).
  // Fallback: the remote URL. Either way, one `cover` property only.
  let coverSrc = ''
  if (book.thumbnail && logseq.settings?.saveImage === true) {
    coverSrc = await saveCoverAsset(book.thumbnail, book.isbn || slugify(book.title))
  }
  if (!coverSrc && book.thumbnail) coverSrc = book.thumbnail
  const coverImage = coverSrc ? `![cover](${coverSrc})` : ''

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
    cover: coverSrc,
    coverImage,
    coverSrc: book.thumbnail,
    infoLink: book.infoLink,
    status: defaultStatus(),
  }

  const properties = renderBookPageProperties(view, logseq.settings?.bookPageTemplate as string)

  // Create an empty page (no pre-block) — page-level properties would
  // force themselves to the top, above the cover. We then append four
  // sibling blocks in the requested order:
  //   cover image → properties block → description quote → source link.
  const page = (await logseq.Editor.createPage(fullTitle, {}, {
    redirect: true,
    createFirstBlock: false,
  })) as PageEntity | null

  if (!page) {
    logseq.UI.showMsg('Failed to create page: ' + fullTitle, 'error')
    console.error('logseq-reading-list: createPage returned null for', fullTitle)
    return
  }

  await new Promise((r) => setTimeout(r, 120))

  const coverBlock = renderBlock(
    logseq.settings?.coverBlockTemplate as string,
    DEFAULT_COVER_BLOCK_TEMPLATE,
    view,
  )
  if (coverBlock) await logseq.Editor.appendBlockInPage(fullTitle, coverBlock)

  if (Object.keys(properties).length > 0) {
    // Empty-content block carrying the rendered properties; Logseq shows
    // it as a clean property list under the cover.
    await logseq.Editor.appendBlockInPage(fullTitle, '', { properties })
  }

  const descBlock = renderBlock(
    logseq.settings?.descriptionBlockTemplate as string,
    DEFAULT_DESCRIPTION_BLOCK_TEMPLATE,
    view,
  )
  if (descBlock) await logseq.Editor.appendBlockInPage(fullTitle, descBlock)

  const linkBlock = renderBlock(
    logseq.settings?.gbooksLinkTemplate as string,
    DEFAULT_GBOOKS_LINK_TEMPLATE,
    view,
  )
  if (linkBlock) await logseq.Editor.appendBlockInPage(fullTitle, linkBlock)

  await ensureReadingListIndex()

  console.log('logseq-reading-list: created book page', fullTitle)
  logseq.UI.showMsg('Page created: ' + fullTitle, 'success', { timeout: 4200 })
}
