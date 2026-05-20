import '@logseq/libs' // https://plugins-doc.logseq.com/
import { SettingSchemaDesc } from '@logseq/libs/dist/LSPlugin.user'
import { logseq as PL } from '../package.json'
import { model } from './modal'
import {
  ensureReadingListIndex,
  readingListModel,
  registerReadingListMacro,
} from './readingList'
import { pageOpen, readingListPageName } from './lib'
import { watchTheme } from './theme'
import {
  DEFAULT_BOOK_PAGE_TEMPLATE,
  DEFAULT_COVER_BLOCK_TEMPLATE,
  DEFAULT_DESCRIPTION_BLOCK_TEMPLATE,
  DEFAULT_GBOOKS_LINK_TEMPLATE,
} from './render'

const pluginId = PL.id

const SETTINGS: SettingSchemaDesc[] = [
  {
    key: 'dataSource',
    title: 'Book data source',
    description:
      'Open Library (default) is completely keyless with no rate limits — recommended. Google Books often has richer descriptions but its keyless quota is a shared global pool that frequently returns rate-limit errors (add an API key below if you choose it).',
    type: 'enum',
    enumChoices: ['Open Library', 'Google Books'],
    enumPicker: 'select',
    default: 'Open Library',
  },
  {
    key: 'apiKey',
    title: 'Google Books API key (Google Books source only)',
    description:
      'Only used when the data source is Google Books. Keyless Google requests share one global quota pool across every app worldwide, so you can hit rate-limit errors even on a private IP. A free key gives you your own quota: https://console.cloud.google.com/apis/credentials (enable the "Books API"). Not needed for Open Library.',
    type: 'string',
    default: '',
  },
  {
    key: 'country',
    title: 'Google Books country code (Google Books source only)',
    description:
      'Only used when the data source is Google Books. Required by that API — without it, non-US requests return zero results. Two-letter code (e.g. US, DE, GB). Ignored for Open Library.',
    type: 'string',
    default: 'US',
  },
  {
    key: 'saveImage',
    title: 'Save cover images to assets',
    description:
      'Download each cover into the graph so the reading list works offline and survives Google link changes. If off, the remote thumbnail URL is used.',
    type: 'boolean',
    default: true,
  },
  {
    key: 'defaultStatus',
    title: 'Default reading status for new books',
    description: 'The status:: applied to a newly added book page.',
    type: 'enum',
    enumChoices: ['to-read', 'reading', 'read'],
    enumPicker: 'select',
    default: 'to-read',
  },
  {
    key: 'pageNamePrefix',
    title: 'Book page name prefix',
    description:
      'Optional namespace prefix for book pages, e.g. "Books/". Leave blank for plain titles.',
    type: 'string',
    default: '',
  },
  {
    key: 'readingListPageName',
    title: 'Reading list index page name',
    description: 'The page that hosts the visual cover grid.',
    type: 'string',
    default: 'Reading List',
  },
  {
    key: 'bookPageTemplate',
    title: 'Book page template (Mustache)',
    description:
      'Mustache template for the book page properties. Output is parsed line-by-line as `key:: value` and written via Logseq\'s structured createPage API. `status` is always injected even if you remove it (the reading-list grid depends on it). ' +
      'Variables: {{title}}, {{author}}, {{authorLinked}} (each as [[wikilink]]), {{publisher}}, {{isbn}}, {{published}}, {{pageCount}}, {{cover}} (markdown image — local base64 data URI, or remote URL fallback), {{coverSrc}} (raw remote URL), {{description}}, {{infoLink}}, {{status}}.',
    type: 'string',
    inputAs: 'textarea',
    default: DEFAULT_BOOK_PAGE_TEMPLATE,
  },
  {
    key: 'descriptionBlockTemplate',
    title: 'Description block template (Mustache)',
    description: 'Block prepended to the page with the synopsis. Variables: same as above.',
    type: 'string',
    inputAs: 'textarea',
    default: DEFAULT_DESCRIPTION_BLOCK_TEMPLATE,
  },
  {
    key: 'coverBlockTemplate',
    title: 'Cover image block template (Mustache)',
    description:
      'Block prepended at the top of the page with the cover image (left-aligned, full width). Set to an empty value to suppress the cover block. Variables: {{coverImage}} (the ready-made `![cover](src)` markdown), plus all of the above.',
    type: 'string',
    inputAs: 'textarea',
    default: DEFAULT_COVER_BLOCK_TEMPLATE,
  },
  {
    key: 'gbooksLinkTemplate',
    title: 'Source link block template (Mustache)',
    description:
      'Block prepended to the page linking to the source record (Open Library or Google Books). Variables: same as above.',
    type: 'string',
    inputAs: 'textarea',
    default: DEFAULT_GBOOKS_LINK_TEMPLATE,
  },
]

const TEMPLATE_DEFAULTS: Record<string, string> = {
  bookPageTemplate: DEFAULT_BOOK_PAGE_TEMPLATE,
  descriptionBlockTemplate: DEFAULT_DESCRIPTION_BLOCK_TEMPLATE,
  coverBlockTemplate: DEFAULT_COVER_BLOCK_TEMPLATE,
  gbooksLinkTemplate: DEFAULT_GBOOKS_LINK_TEMPLATE,
}

/**
 * Logseq does not backfill schema defaults onto settings keys already
 * written to disk (which happens on first load). Without this the
 * template textareas show up blank. Fill any missing/blank one.
 */
function backfillTemplateDefaults(): void {
  const s = logseq.settings ?? {}
  const updates: Record<string, string> = {}
  for (const [key, def] of Object.entries(TEMPLATE_DEFAULTS)) {
    if (!(s[key] as string | undefined)?.trim()) updates[key] = def
  }
  if (Object.keys(updates).length > 0) {
    logseq.updateSettings(updates)
    console.log('logseq-reading-list: backfilled template defaults', Object.keys(updates))
  }
}

const main = async () => {
  logseq.useSettingsSchema(SETTINGS)
  backfillTemplateDefaults()

  logseq.App.registerUIItem('toolbar', {
    key: pluginId,
    template: `<a class="button" data-on-click="OpenToolbarGoogle" title="Add a book to your Reading List" style="display:flex;align-items:center"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg></a>`,
  })

  registerReadingListMacro()
  watchTheme()

  logseq.App.registerCommandPalette(
    { key: 'reading-list-open', label: 'Reading List: open index page' },
    async () => {
      await ensureReadingListIndex()
      await pageOpen(readingListPageName(), false)
    },
  )

  logseq.App.registerCommandPalette(
    { key: 'reading-list-add', label: 'Reading List: add a book…' },
    () => model.OpenToolbarGoogle(),
  )

  logseq.App.registerCommandPalette(
    { key: 'reading-list-refresh', label: 'Reading List: refresh grid' },
    () => readingListModel.rlRefresh(),
  )

  logseq.App.registerCommandPalette(
    { key: 'reading-list-reset-templates', label: 'Reading List: reset templates to defaults' },
    () => {
      logseq.updateSettings(TEMPLATE_DEFAULTS)
      logseq.UI.showMsg('Reading List templates reset to defaults.', 'success')
    },
  )
}

// First arg is registered as the provideModel (data-on-click handlers).
logseq.ready({ ...model, ...readingListModel }, main).catch(console.error)
