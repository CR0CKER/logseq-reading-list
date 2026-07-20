import { describe, expect, it } from 'vitest'
import {
  BookView,
  DEFAULT_BOOK_PAGE_TEMPLATE,
  extractIsbn,
  normalisePublished,
  renderBlock,
  renderBookPageProperties,
  sanitiseForWikilink,
  sanitisePageName,
  sanitisePropertyValue,
  truncate,
} from '../src/render'

/** A complete BookView; individual tests override only the fields they exercise. */
function bookView(overrides: Partial<BookView> = {}): BookView {
  return {
    title: 'Dune',
    fullTitle: 'Dune',
    author: 'Frank Herbert',
    authorLinked: '[[Frank Herbert]]',
    publisher: 'Ace',
    isbn: '9780441013593',
    published: '1965',
    pageCount: '412',
    description: 'A desert planet.',
    cover: '',
    coverImage: '',
    tags: 'Science Fiction',
    tagsLinked: '[[Science Fiction]]',
    coverSrc: '',
    infoLink: '',
    status: 'to-read',
    ...overrides,
  }
}

describe('sanitisePageName', () => {
  it('replaces wikilink brackets with parentheses', () => {
    expect(sanitisePageName('The [Book]')).toBe('The (Book)')
  })

  it('turns a colon (property syntax) into an em-dash with surrounding spaces', () => {
    expect(sanitisePageName('Dune: Part Two')).toBe('Dune — Part Two')
  })

  it('replaces a slash (namespace separator) with a space', () => {
    expect(sanitisePageName('AC/DC')).toBe('AC DC')
  })

  it('collapses runs of whitespace and trims', () => {
    expect(sanitisePageName('  a   b  ')).toBe('a b')
  })

  // H1 boundary: sanitisePageName does NOT strip < > & " — that is by design.
  // Page-name safety is about Logseq syntax; XSS safety is escapeHtml's job at
  // the innerHTML sink (see src/html.ts). This test pins that contract so a
  // future change here can't silently look like it also fixed escaping.
  it('does NOT strip HTML-significant characters (that is escapeHtml’s job)', () => {
    expect(sanitisePageName('a <b> & "c"')).toBe('a <b> & "c"')
  })
})

describe('normalisePublished', () => {
  it('keeps a bare year', () => {
    expect(normalisePublished('2009')).toBe('2009')
  })

  it('reduces a full ISO date to yyyy/MM', () => {
    expect(normalisePublished('2009-05-04')).toBe('2009/05')
  })

  it('reduces a year-month to yyyy/MM', () => {
    expect(normalisePublished('2009-05')).toBe('2009/05')
  })

  it('ignores a single-digit month (needs two digits) and keeps the year', () => {
    expect(normalisePublished('2009-5')).toBe('2009')
  })

  it('returns empty for a non-year-leading string', () => {
    expect(normalisePublished('May 2009')).toBe('')
  })

  it('returns empty for undefined / empty input', () => {
    expect(normalisePublished(undefined)).toBe('')
    expect(normalisePublished('')).toBe('')
  })
})

describe('extractIsbn', () => {
  it('prefers ISBN_13 over ISBN_10', () => {
    const ids = [
      { type: 'ISBN_10', identifier: '0441013597' },
      { type: 'ISBN_13', identifier: '9780441013593' },
    ]
    expect(extractIsbn(ids)).toBe('9780441013593')
  })

  it('falls back to ISBN_10 when no ISBN_13 is present', () => {
    expect(extractIsbn([{ type: 'ISBN_10', identifier: '0441013597' }])).toBe('0441013597')
  })

  it('trims surrounding whitespace on the identifier', () => {
    expect(extractIsbn([{ type: 'ISBN_13', identifier: ' 9780441013593 ' }])).toBe('9780441013593')
  })

  it('returns empty when there is no usable identifier or bad input', () => {
    expect(extractIsbn([{ type: 'OTHER', identifier: 'x' }])).toBe('')
    expect(extractIsbn([])).toBe('')
    expect(extractIsbn(undefined)).toBe('')
  })
})

describe('truncate', () => {
  it('leaves a short string untouched', () => {
    expect(truncate('short', 10)).toBe('short')
  })

  it('slices to the limit and appends an ellipsis when over length', () => {
    expect(truncate('abcdefghij', 5)).toBe('abcde…')
  })

  it('trims trailing whitespace before the ellipsis', () => {
    expect(truncate('abcd      efg', 6)).toBe('abcd…')
  })

  it('returns empty for undefined / empty input', () => {
    expect(truncate(undefined)).toBe('')
    expect(truncate('')).toBe('')
  })
})

describe('sanitiseForWikilink', () => {
  it('converts brackets so the title cannot break out of [[…]]', () => {
    expect(sanitiseForWikilink('K[a]y')).toBe('K(a)y')
  })
})

describe('sanitisePropertyValue', () => {
  it('decodes named, decimal and hex HTML entities', () => {
    expect(sanitisePropertyValue('Ben &amp; Jerry')).toBe('Ben & Jerry')
    expect(sanitisePropertyValue('caf&#233;')).toBe('café')
    expect(sanitisePropertyValue('em&#x2014;dash')).toBe('em—dash')
  })

  it('leaves an unknown entity untouched', () => {
    expect(sanitisePropertyValue('a &notanentity; b')).toBe('a &notanentity; b')
  })

  it('strips HTML tags, turning <br> and block closers into spaces', () => {
    expect(sanitisePropertyValue('<b>Hi</b>')).toBe('Hi')
    expect(sanitisePropertyValue('Line1<br>Line2')).toBe('Line1 Line2')
  })

  it('collapses newlines/whitespace and neutralises the :: property delimiter', () => {
    expect(sanitisePropertyValue('a\n\nb   c')).toBe('a b c')
    expect(sanitisePropertyValue('key:: value')).toBe('key: value')
  })

  it('returns empty for null / undefined', () => {
    expect(sanitisePropertyValue(null)).toBe('')
    expect(sanitisePropertyValue(undefined)).toBe('')
  })
})

describe('renderBookPageProperties', () => {
  it('parses the rendered template into key → value properties', () => {
    const props = renderBookPageProperties(
      bookView({ status: 'reading', title: 'Dune' }),
      'status:: {{status}}\nfull-title:: {{title}}',
    )
    expect(props).toEqual({ status: 'reading', 'full-title': 'Dune' })
  })

  it('force-injects status even when a custom template omits it (grid depends on it)', () => {
    const props = renderBookPageProperties(bookView({ status: 'read' }), 'full-title:: {{title}}')
    expect(props.status).toBe('read')
  })

  it('drops property lines whose value renders empty', () => {
    // isbn is blank → the `isbn::` line collapses and must not appear.
    const props = renderBookPageProperties(
      bookView({ isbn: '', status: 'to-read' }),
      'status:: {{status}}\nisbn:: {{isbn}}',
    )
    expect(props).not.toHaveProperty('isbn')
    expect(props.status).toBe('to-read')
  })

  it('falls back to the default template when given a blank template', () => {
    const props = renderBookPageProperties(bookView({ status: 'reading' }), '   ')
    // The default template always emits status + full-title + category.
    expect(props.status).toBe('reading')
    expect(props['full-title']).toBe('Dune')
    expect(DEFAULT_BOOK_PAGE_TEMPLATE).toContain('status:: {{status}}')
  })
})

describe('renderBlock', () => {
  it('renders a present variable', () => {
    const out = renderBlock('cover:: {{title}}', 'fallback', bookView({ title: 'Dune' }))
    expect(out).toBe('cover:: Dune')
  })

  it('uses the fallback template when the primary is blank', () => {
    const out = renderBlock('', '{{#infoLink}}[link]({{infoLink}}){{/infoLink}}', bookView({ infoLink: 'http://x' }))
    expect(out).toBe('[link](http://x)')
  })

  it('collapses to empty when the section variable is absent', () => {
    const out = renderBlock('{{#infoLink}}[link]({{infoLink}}){{/infoLink}}', 'fb', bookView({ infoLink: '' }))
    expect(out).toBe('')
  })
})
