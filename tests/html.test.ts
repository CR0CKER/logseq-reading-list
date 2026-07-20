import { describe, expect, it } from 'vitest'
import { escapeHtml } from '../src/html'

describe('escapeHtml', () => {
  // H1 regression: a book title from Open Library (publicly editable) or
  // Google Books can carry an HTML/JS payload. It reaches innerHTML in the
  // confirm dialog and the result cards; escapeHtml must render it inert.
  it('neutralises an <img onerror> XSS payload so no tag survives', () => {
    const payload = 'Dune <img src=x onerror=alert(1)>'
    const out = escapeHtml(payload)
    expect(out).not.toMatch(/<img/i)
    expect(out).not.toContain('<')
    expect(out).not.toContain('>')
    expect(out).toBe('Dune &lt;img src=x onerror=alert(1)&gt;')
  })

  it('escapes every one of the five HTML-significant characters', () => {
    expect(escapeHtml(`& < > " '`)).toBe('&amp; &lt; &gt; &quot; &#39;')
  })

  it('escapes a double-quote so a value cannot break out of an attribute', () => {
    // e.g. src="${escapeHtml(url)}" — a quote must not close the attribute.
    expect(escapeHtml('" onerror="alert(1)')).toBe('&quot; onerror=&quot;alert(1)')
  })

  it('escapes ampersand first so existing entities are not double-decoded', () => {
    // "&lt;" must become "&amp;lt;", not stay "&lt;" (which a browser would
    // then render as a literal "<").
    expect(escapeHtml('&lt;')).toBe('&amp;lt;')
  })

  it('leaves ordinary text untouched', () => {
    expect(escapeHtml('The Left Hand of Darkness')).toBe('The Left Hand of Darkness')
  })

  it('coerces null/undefined to an empty string', () => {
    expect(escapeHtml(null)).toBe('')
    expect(escapeHtml(undefined)).toBe('')
  })
})
