import { PageEntity } from '@logseq/libs/dist/LSPlugin.user'
import { downloadCover } from './toAssets'
import { ensureReadingListIndex } from './readingList'
import {
  BookView,
  DEFAULT_DESCRIPTION_BLOCK_TEMPLATE,
  DEFAULT_GBOOKS_LINK_TEMPLATE,
  READING_STATUSES,
  ReadingStatus,
  extractIsbn,
  normalisePublished,
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

export const createBookPage = async (data: any, selectedTitle: string, FullTitle: string) => {
  const selectedBook = data.items.find(
    (item: any) => item.volumeInfo?.title?.replaceAll('/', ' ') === selectedTitle,
  )
  if (!selectedBook) {
    logseq.UI.showMsg('Failed to create page: ' + FullTitle, 'error')
    console.error('logseq-reading-list: no matching book for', FullTitle)
    return
  }

  const vi = selectedBook.volumeInfo ?? {}
  const isbn = extractIsbn(vi.industryIdentifiers)
  const authors: string[] = Array.isArray(vi.authors) ? vi.authors : vi.authors ? [vi.authors] : []
  const thumbnail: string = vi.imageLinks?.thumbnail || vi.imageLinks?.smallThumbnail || ''
  const coverSrc = thumbnail ? thumbnail.replace(/^http:/, 'https:') : ''

  const subfolder = (logseq.settings?.assetsSubfolder as string)?.trim() || 'reading-list'
  let cover = ''
  if (thumbnail && logseq.settings?.saveImage === true) {
    cover = await downloadCover(thumbnail, isbn || slugify(selectedTitle), subfolder)
  }
  // If asset download is off or failed, embed the remote thumbnail so the
  // page still shows a cover.
  if (!cover && coverSrc) cover = `![cover](${coverSrc})`

  const cleanAuthors = authors.map((a) => sanitisePropertyValue(a)).filter(Boolean)
  const view: BookView = {
    title: sanitisePropertyValue(vi.title),
    fullTitle: FullTitle,
    author: cleanAuthors.join(', '),
    authorLinked: cleanAuthors.map((a) => `[[${sanitiseForWikilink(a)}]]`).join(', '),
    publisher: sanitisePropertyValue(vi.publisher),
    isbn,
    published: normalisePublished(vi.publishedDate),
    pageCount: vi.pageCount ? String(vi.pageCount) : '',
    description: truncate(sanitisePropertyValue(vi.description)),
    cover,
    coverSrc,
    infoLink: vi.infoLink || '',
    status: defaultStatus(),
  }

  const properties = renderBookPageProperties(view, logseq.settings?.bookPageTemplate as string)

  const page = (await logseq.Editor.createPage(FullTitle, properties, {
    redirect: true,
    createFirstBlock: true,
  })) as PageEntity | null

  if (!page) {
    logseq.UI.showMsg('Failed to create page: ' + FullTitle, 'error')
    console.error('logseq-reading-list: createPage returned null for', FullTitle)
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

  console.log('logseq-reading-list: created book page', FullTitle)
  logseq.UI.showMsg('Page created: ' + FullTitle, 'success', { timeout: 4200 })
}
