import { PageEntity } from '@logseq/libs/dist/LSPlugin.user'
import '@logseq/libs'
import { sanitisePageName } from './render'

export const READING_LIST_PAGE_DEFAULT = 'Reading List'

/** Final Logseq page name for a book: optional prefix + sanitised title. */
export function bookPageName(rawTitle: string): string {
  const prefix = (logseq.settings?.pageNamePrefix as string)?.trim() || ''
  const safe = sanitisePageName(rawTitle)
  return prefix ? `${prefix}${safe}` : safe
}

export function readingListPageName(): string {
  return (logseq.settings?.readingListPageName as string)?.trim() || READING_LIST_PAGE_DEFAULT
}

export function closeModal() {
  const appDialog = document.getElementById('appDialog') as HTMLDialogElement
  if (appDialog) appDialog.close()
}

export function openModal() {
  const appDialog = document.getElementById('appDialog') as HTMLDialogElement
  if (appDialog && !appDialog.open) appDialog.showModal()
}

export function setCloseButton() {
  const btn = document.getElementById('closeBtn') as HTMLButtonElement
  if (btn)
    btn.addEventListener('click', () => {
      closeModal()
      logseq.hideMainUI()
    })
}

export function setReadingPageButton() {
  const btn = document.getElementById('ReadingBtn') as HTMLButtonElement
  if (btn)
    btn.addEventListener('click', (ev) => {
      closeModal()
      logseq.hideMainUI()
      pageOpen(readingListPageName(), ev.shiftKey)
    })
}

export const pageOpen = async (pageName: string, shiftKey: boolean) => {
  const page = (await logseq.Editor.getPage(pageName)) as { uuid: PageEntity['uuid'] } | null
  if (page) {
    if (shiftKey) logseq.Editor.openInRightSidebar(page.uuid)
    else logseq.Editor.scrollToBlockInPage(pageName, page.uuid)
  }
}

export function setMainUIApp(appHtml: string) {
  const mainUIApp = document.getElementById('app') as HTMLDivElement
  if (mainUIApp) {
    mainUIApp.innerHTML = appHtml
    const appDialog = document.getElementById('appDialog') as HTMLDialogElement | null
    // Native <dialog> closes on Esc but doesn't fire any JS we wrote —
    // the X-button handler is what otherwise calls logseq.hideMainUI().
    // Without this listener, pressing Esc closes the dialog but leaves
    // the (now-empty) plugin iframe mounted on top of Logseq, swallowing
    // every click underneath and making the whole UI appear frozen.
    // 'close' fires for every close path (Esc, programmatic .close(),
    // backdrop click); hideMainUI() is idempotent so duplicate calls
    // from the X button are harmless.
    if (appDialog) {
      appDialog.addEventListener('close', () => logseq.hideMainUI(), { once: true })
    }
    openModal()
    logseq.showMainUI()
  }
}
