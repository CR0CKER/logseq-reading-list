import { READING_STATUSES } from './render'

/** Filter chip sentinel for the favorites-only view. Kept distinct from
 *  READING_STATUSES so `currentFilter` stays a single string. */
export const FAVORITE_FILTER = 'favorite'

/** Display labels offered by the `defaultFilter` setting, mapped to the
 *  internal filter keys used by the grid's chips. */
export const DEFAULT_FILTER_CHOICES: Record<string, string> = {
  All: 'all',
  'To Read': 'to-read',
  Reading: 'reading',
  Read: 'read',
  Favorites: FAVORITE_FILTER,
}

const VALID_FILTERS: readonly string[] = ['all', ...READING_STATUSES, FAVORITE_FILTER]

/**
 * Pick the filter chip that is active when the grid mounts.
 *
 * Precedence: a valid filter argument on the renderer macro
 * (`{{renderer :reading-list, reading}}`) → the `defaultFilter` setting
 * label → `all`. Both inputs come from user-editable text/settings, so
 * anything unrecognised falls through rather than throwing.
 *
 * @param macroArg second macro argument, if any
 * @param setting  value of `logseq.settings.defaultFilter`
 * @returns an internal filter key (`all`, a reading status, or `favorite`)
 */
export function resolveInitialFilter(macroArg: unknown, setting: unknown): string {
  const arg = typeof macroArg === 'string' ? macroArg.trim().toLowerCase() : ''
  if (VALID_FILTERS.includes(arg)) return arg
  if (typeof setting === 'string' && Object.prototype.hasOwnProperty.call(DEFAULT_FILTER_CHOICES, setting)) {
    return DEFAULT_FILTER_CHOICES[setting]
  }
  return 'all'
}
