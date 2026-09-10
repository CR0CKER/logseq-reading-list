import { describe, expect, it } from 'vitest'
import { FAVORITE_FILTER, resolveInitialFilter } from '../src/filters'

describe('resolveInitialFilter', () => {
  it('prefers a valid macro argument over the setting', () => {
    expect(resolveInitialFilter('reading', 'Favorites')).toBe('reading')
  })

  it.each([
    ['All', 'all'],
    ['To Read', 'to-read'],
    ['Reading', 'reading'],
    ['Read', 'read'],
    ['Favorites', FAVORITE_FILTER],
  ])('maps the %s setting label to the %s filter', (label, expected) => {
    expect(resolveInitialFilter(undefined, label)).toBe(expected)
  })

  it('falls back to all when the setting is missing, unknown, or not a string', () => {
    expect(resolveInitialFilter(undefined, undefined)).toBe('all')
    expect(resolveInitialFilter(undefined, 'Someday')).toBe('all')
    expect(resolveInitialFilter(undefined, 42)).toBe('all')
    expect(resolveInitialFilter('', null)).toBe('all')
  })

  it('ignores an invalid macro argument and uses the setting instead', () => {
    expect(resolveInitialFilter('bogus', 'Read')).toBe('read')
  })

  it('accepts a macro argument regardless of case and surrounding whitespace', () => {
    expect(resolveInitialFilter(' Favorite ', 'All')).toBe(FAVORITE_FILTER)
    expect(resolveInitialFilter('TO-READ', 'All')).toBe('to-read')
  })

  it('does not accept a setting label as a macro argument', () => {
    // Macro args use the internal keys (`to-read`), not display labels
    // (`To Read`); a label there is treated as invalid, same as before.
    expect(resolveInitialFilter('To Read', 'Reading')).toBe('reading')
  })
})
