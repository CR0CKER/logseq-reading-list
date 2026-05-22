import '@logseq/libs'
import { extractIsbn, normalisePublished } from './render'

/** Normalised book record both providers map onto. */
export interface BookResult {
  source: 'openlibrary' | 'google'
  title: string
  authors: string[]
  publisher: string
  publishedDate: string
  /** May be empty for Open Library until fetchDescription() resolves it. */
  description: string
  isbn: string
  /** Remote cover URL (https), or '' if none. */
  thumbnail: string
  pageCount: string
  /** Topic tags: Open Library `subject[]` or Google Books `categories[]`. */
  subjects: string[]
  infoLink: string
  /** Open Library work key (e.g. "/works/OL123W") for lazy description fetch. */
  workKey?: string
}

export type SearchMode = 'title' | 'author' | 'isbn'

export interface SearchOutcome {
  ok: boolean
  results: BookResult[]
  status?: number
  error?: string
}

export function currentSource(): 'openlibrary' | 'google' {
  return logseq.settings?.dataSource === 'Google Books' ? 'google' : 'openlibrary'
}

const GOOGLE_RATE_LIMIT_HINT =
  'Google Books rate limit reached. Keyless requests share one global quota that is often exhausted (not your IP). Add a free API key in settings, or switch the data source to Open Library (keyless).'

export async function searchBooks(mode: SearchMode, query: string): Promise<SearchOutcome> {
  const q = query.trim()
  if (!q) return { ok: true, results: [] }
  try {
    return currentSource() === 'google'
      ? await searchGoogle(mode, q)
      : await searchOpenLibrary(mode, q)
  } catch (e) {
    console.error('logseq-reading-list: search failed', e)
    return {
      ok: false,
      results: [],
      error: 'Could not reach the book service (network/CORS). Check your connection.',
    }
  }
}

/* ---------------- Google Books ---------------- */

function googleUrl(mode: SearchMode, value: string): string {
  const country = (logseq.settings?.country as string)?.trim() || 'US'
  const apiKey = (logseq.settings?.apiKey as string)?.trim()
  const v = encodeURIComponent(value)
  const prefix = mode === 'isbn' ? `isbn:${v}` : mode === 'author' ? `inauthor:${v}` : `intitle:${v}`
  const keyParam = apiKey ? `&key=${encodeURIComponent(apiKey)}` : ''
  return `https://www.googleapis.com/books/v1/volumes?q=${prefix}&country=${encodeURIComponent(country)}&maxResults=20${keyParam}`
}

async function searchGoogle(mode: SearchMode, q: string): Promise<SearchOutcome> {
  const res = await fetch(googleUrl(mode, q))
  if (!res.ok) {
    return {
      ok: false,
      results: [],
      status: res.status,
      error:
        res.status === 429
          ? GOOGLE_RATE_LIMIT_HINT
          : `Google Books request failed (HTTP ${res.status}).`,
    }
  }
  const data = await res.json()
  const items: any[] = Array.isArray(data.items) ? data.items : []
  const results: BookResult[] = items.map((it) => {
    const vi = it.volumeInfo ?? {}
    const thumb = vi.imageLinks?.thumbnail || vi.imageLinks?.smallThumbnail || ''
    return {
      source: 'google',
      title: vi.title || '',
      authors: Array.isArray(vi.authors) ? vi.authors : vi.authors ? [vi.authors] : [],
      publisher: vi.publisher || '',
      publishedDate: normalisePublished(vi.publishedDate),
      description: vi.description || '',
      isbn: extractIsbn(vi.industryIdentifiers),
      thumbnail: thumb ? thumb.replace(/^http:/, 'https:') : '',
      pageCount: vi.pageCount ? String(vi.pageCount) : '',
      subjects: Array.isArray(vi.categories) ? vi.categories.slice(0, 5) : [],
      infoLink: vi.infoLink || '',
    }
  })
  return { ok: true, results }
}

/* ---------------- Open Library ---------------- */

const OL_FIELDS =
  'key,title,author_name,first_publish_year,isbn,number_of_pages_median,cover_i,publisher,subject'

function openLibraryUrl(mode: SearchMode, value: string): string {
  const v = encodeURIComponent(value)
  // Title mode uses the general `q=` index, not the field-scoped `title=`:
  // OL's title field is stricter and unreliable (often returns nothing for
  // titles it does hold), while `q=` is the robust index its own site uses.
  const param = mode === 'isbn' ? `isbn=${v}` : mode === 'author' ? `author=${v}` : `q=${v}`
  return `https://openlibrary.org/search.json?${param}&limit=20&fields=${OL_FIELDS}`
}

function pickIsbn(isbns: any): string {
  if (!Array.isArray(isbns) || isbns.length === 0) return ''
  const i13 = isbns.find((s: string) => /^\d{13}$/.test(String(s).replace(/-/g, '')))
  return String(i13 || isbns[0]).replace(/-/g, '')
}

async function searchOpenLibrary(mode: SearchMode, q: string): Promise<SearchOutcome> {
  const res = await fetch(openLibraryUrl(mode, q))
  if (!res.ok) {
    return {
      ok: false,
      results: [],
      status: res.status,
      error: `Open Library request failed (HTTP ${res.status}).`,
    }
  }
  const data = await res.json()
  const docs: any[] = Array.isArray(data.docs) ? data.docs : []
  const results: BookResult[] = docs.map((d) => {
    const isbn = pickIsbn(d.isbn)
    let thumbnail = ''
    if (d.cover_i) thumbnail = `https://covers.openlibrary.org/b/id/${d.cover_i}-L.jpg`
    else if (isbn) thumbnail = `https://covers.openlibrary.org/b/isbn/${isbn}-L.jpg`
    return {
      source: 'openlibrary',
      title: d.title || '',
      authors: Array.isArray(d.author_name) ? d.author_name : [],
      publisher: Array.isArray(d.publisher) ? d.publisher[0] || '' : '',
      publishedDate: d.first_publish_year ? String(d.first_publish_year) : '',
      description: '',
      isbn,
      thumbnail,
      pageCount: d.number_of_pages_median ? String(d.number_of_pages_median) : '',
      subjects: Array.isArray(d.subject) ? d.subject.slice(0, 5) : [],
      infoLink: d.key ? `https://openlibrary.org${d.key}` : '',
      workKey: typeof d.key === 'string' && d.key.startsWith('/works/') ? d.key : undefined,
    }
  })
  return { ok: true, results }
}

/**
 * Open Library search results carry no description; fetch it from the
 * work record only for the book the user actually picked. Google results
 * already include it.
 */
export async function fetchDescription(book: BookResult): Promise<string> {
  if (book.description) return book.description
  if (book.source !== 'openlibrary' || !book.workKey) return ''
  try {
    const res = await fetch(`https://openlibrary.org${book.workKey}.json`)
    if (!res.ok) return ''
    const data = await res.json()
    const d = data.description
    if (typeof d === 'string') return d
    if (d && typeof d.value === 'string') return d.value
    return ''
  } catch (e) {
    console.warn('logseq-reading-list: OL description fetch failed', e)
    return ''
  }
}
