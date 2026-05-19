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
  DEFAULT_DESCRIPTION_BLOCK_TEMPLATE,
  DEFAULT_GBOOKS_LINK_TEMPLATE,
} from './render'

const pluginId = PL.id

const SETTINGS: SettingSchemaDesc[] = [
  {
    key: 'apiKey',
    title: 'Google Books API key (recommended)',
    description:
      'Keyless requests share one global quota pool across every plugin/app worldwide, so you can hit "rate limit" errors even on a private IP when that pool is exhausted. A free API key gives you your own quota. Get one at https://console.cloud.google.com/apis/credentials (enable the "Books API"), paste it here. Leave blank to use the shared keyless pool.',
    type: 'string',
    default: '',
  },
  {
    key: 'country',
    title: 'Google Books country code',
    description:
      'Required by the Google Books API. Without it, searches from non-US regions silently return zero results. Use your two-letter country code (e.g. US, DE, GB).',
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
    key: 'assetsSubfolder',
    title: 'Cover assets subfolder',
    description: 'Subfolder under the plugin asset storage where covers are saved.',
    type: 'string',
    default: 'reading-list',
  },
  {
    key: 'bookPageTemplate',
    title: 'Book page template (Mustache)',
    description:
      'Mustache template for the book page properties. Output is parsed line-by-line as `key:: value` and written via Logseq\'s structured createPage API. `status` is always injected even if you remove it (the reading-list grid depends on it). ' +
      'Variables: {{title}}, {{author}}, {{authorLinked}} (each as [[wikilink]]), {{publisher}}, {{isbn}}, {{published}}, {{pageCount}}, {{cover}} (local asset markdown), {{coverSrc}} (remote URL), {{description}}, {{infoLink}}, {{status}}.',
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
    key: 'gbooksLinkTemplate',
    title: 'Google Books link block template (Mustache)',
    description: 'Block prepended to the page linking to Google Books. Variables: same as above.',
    type: 'string',
    inputAs: 'textarea',
    default: DEFAULT_GBOOKS_LINK_TEMPLATE,
  },
]

const TEMPLATE_DEFAULTS: Record<string, string> = {
  bookPageTemplate: DEFAULT_BOOK_PAGE_TEMPLATE,
  descriptionBlockTemplate: DEFAULT_DESCRIPTION_BLOCK_TEMPLATE,
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
