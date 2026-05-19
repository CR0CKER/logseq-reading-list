import Mustache from 'mustache'

/**
 * Default book-page template. Shown verbatim in the settings panel so
 * users see and can edit a real starting point.
 *
 * The rendered output is parsed line-by-line back into `key:: value`
 * properties and written via Logseq's structured `createPage` properties
 * API for safe escaping — the same path whether the user keeps the
 * default or customises it. Lines that don't match `key:: value` are
 * dropped, so empty Mustache sections collapse cleanly.
 *
 * `status` drives the reading-list grid; it is force-injected by
 * renderBookPageProperties() even if a custom template omits it.
 */
export const DEFAULT_BOOK_PAGE_TEMPLATE = `status:: {{status}}
{{#authorLinked}}author:: {{authorLinked}}{{/authorLinked}}
{{#publisher}}publisher:: {{publisher}}{{/publisher}}
{{#isbn}}isbn:: {{isbn}}{{/isbn}}
{{#published}}published:: {{published}}{{/published}}
{{#pageCount}}pages:: {{pageCount}}{{/pageCount}}
{{#cover}}cover:: {{cover}}{{/cover}}
{{#coverSrc}}cover-src:: {{coverSrc}}{{/coverSrc}}
tags:: [[Reading]]`

export const DEFAULT_DESCRIPTION_BLOCK_TEMPLATE = `{{#description}}#+BEGIN_QUOTE
{{description}}
#+END_QUOTE{{/description}}`

export const DEFAULT_GBOOKS_LINK_TEMPLATE = `{{#infoLink}}[More about this book ↗]({{infoLink}}){{/infoLink}}`

export const READING_STATUSES = ['to-read', 'reading', 'read'] as const
export type ReadingStatus = (typeof READING_STATUSES)[number]

export interface BookView {
  /** Plain title, sanitised for a property value. */
  title: string
  /** Title as it will appear in the page name (callers sanitise further). */
  fullTitle: string
  /** Comma-joined plain-text author list. */
  author: string
  /** Each author wrapped as a [[wikilink]], comma-joined. */
  authorLinked: string
  publisher: string
  isbn: string
  /** Publication date, normalised to yyyy/MM where possible. */
  published: string
  pageCount: string
  /** HTML-decoded, tag-stripped, length-capped description. */
  description: string
  /** Markdown image ref to the locally-saved cover (may be empty). */
  cover: string
  /** Raw remote thumbnail URL — guaranteed-renderable grid fallback. */
  coverSrc: string
  infoLink: string
  status: ReadingStatus
}

const PROPERTY_LINE_RE = /^([a-zA-Z][a-zA-Z0-9-]*)::\s*(.+?)\s*$/

function parseInlineProperties(text: string): Record<string, string> {
  const out: Record<string, string> = {}
  for (const rawLine of text.split('\n')) {
    const m = rawLine.match(PROPERTY_LINE_RE)
    if (!m) continue
    const [, key, value] = m
    if (!value || out[key]) continue
    out[key] = value
  }
  return out
}

/**
 * Render the book-page template into a `key → value` map for Logseq's
 * structured `createPage(name, properties)` API.
 *
 * `status` is force-injected after parsing so the reading-list query
 * stays reliable even if a custom template drops the status line.
 */
export function renderBookPageProperties(view: BookView, template: string | undefined): Record<string, string> {
  const tpl = template?.trim() ? template : DEFAULT_BOOK_PAGE_TEMPLATE
  const rendered = renderTemplate(tpl, view as unknown as Record<string, any>)
  const props = parseInlineProperties(rendered)
  if (!props.status) props.status = view.status
  return props
}

/** Render a standalone block template (description, Google Books link). */
export function renderBlock(template: string | undefined, fallback: string, view: BookView): string {
  const tpl = template?.trim() ? template : fallback
  return renderTemplate(tpl, view as unknown as Record<string, any>).trim()
}

function renderTemplate(template: string, view: Record<string, any>): string {
  // Disable HTML escaping; Logseq blocks want raw markdown.
  const out = Mustache.render(template, view, undefined, { escape: (v: string) => v })
  return collapseEmptyLines(out)
}

/**
 * Drop empty property lines (e.g. `isbn:: ` with no value, which confuse
 * Logseq's property indexer) and collapse runs of blank lines to one.
 */
function collapseEmptyLines(s: string): string {
  const lines = s.split('\n').filter((line) => {
    const trimmed = line.trim()
    if (trimmed === '') return true
    const propMatch = trimmed.match(/^[a-z][a-z0-9-]*::\s*(.*)$/i)
    if (propMatch && propMatch[1].trim() === '') return false
    return true
  })
  const out: string[] = []
  for (const line of lines) {
    if (line.trim() === '' && (out.length === 0 || out[out.length - 1].trim() === '')) continue
    out.push(line)
  }
  while (out.length > 0 && out[out.length - 1].trim() === '') out.pop()
  return out.join('\n')
}

/**
 * Make a value safe as a Logseq block property value. Empty/unrenderable
 * values become '' so the surrounding `{{#var}}…{{/var}}` section drops.
 * Google Books descriptions are HTML — decode entities, strip tags,
 * collapse whitespace so they read as plain text in Logseq.
 */
export function sanitisePropertyValue(value: any): string {
  if (value === undefined || value === null) return ''
  let s = String(value)
  s = decodeHtmlEntities(s)
  s = stripHtmlTags(s)
  s = s.replace(/\r?\n+/g, ' ').replace(/::/g, ':').replace(/\s+/g, ' ').trim()
  return s
}

const HTML_ENTITIES: Record<string, string> = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ',
  ldquo: '“', rdquo: '”', lsquo: '‘', rsquo: '’',
  ndash: '–', mdash: '—', hellip: '…',
  auml: 'ä', ouml: 'ö', uuml: 'ü', szlig: 'ß',
  Auml: 'Ä', Ouml: 'Ö', Uuml: 'Ü',
  eacute: 'é', egrave: 'è', aacute: 'á', iacute: 'í',
  oacute: 'ó', uacute: 'ú', ntilde: 'ñ', ccedil: 'ç',
}

function decodeHtmlEntities(s: string): string {
  return s
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(parseInt(dec, 10)))
    .replace(/&([a-zA-Z]+);/g, (m, name) => HTML_ENTITIES[name] ?? m)
}

function stripHtmlTags(s: string): string {
  return s
    .replace(/<\s*br\s*\/?>/gi, ' ')
    .replace(/<\s*\/\s*(p|div|li|h[1-6])\s*>/gi, ' ')
    .replace(/<[^>]+>/g, '')
}

export function sanitiseForWikilink(s: string): string {
  return s.replace(/\[/g, '(').replace(/\]/g, ')')
}

const MAX_PROPERTY_LENGTH = 500

export function truncate(s: string | undefined, max = MAX_PROPERTY_LENGTH): string {
  if (!s) return ''
  return s.length > max ? s.slice(0, max).trimEnd() + '…' : s
}

/**
 * Replace characters in a book title that break Logseq syntax when the
 * name is referenced via [[wikilink]] or passed to createPage:
 *  - `[`/`]` collide with wikilink delimiters
 *  - `:` is reserved by property syntax; createPage rejects it
 *  - `/` creates an unwanted namespace hierarchy
 */
export function sanitisePageName(title: string): string {
  return title
    .replace(/\[/g, '(')
    .replace(/\]/g, ')')
    .replace(/:\s*/g, ' — ')
    .replace(/\//g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Normalise a Google Books publishedDate ("2009", "2009-05", "2009-05-04") to yyyy/MM. */
export function normalisePublished(raw: string | undefined): string {
  if (!raw) return ''
  const m = String(raw).match(/^(\d{4})(?:-(\d{2}))?/)
  if (!m) return ''
  return m[2] ? `${m[1]}/${m[2]}` : m[1]
}

/** Extract a usable ISBN from Google Books volumeInfo.industryIdentifiers. */
export function extractIsbn(industryIdentifiers: any[] | undefined): string {
  if (!Array.isArray(industryIdentifiers)) return ''
  const i13 = industryIdentifiers.find((x) => x?.type === 'ISBN_13')
  if (i13?.identifier) return String(i13.identifier).trim()
  const i10 = industryIdentifiers.find((x) => x?.type === 'ISBN_10')
  if (i10?.identifier) return String(i10.identifier).trim()
  return ''
}
