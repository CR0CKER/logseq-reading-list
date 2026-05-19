import { IAsyncStorage } from '@logseq/libs/dist/modules/LSPlugin.Storage'
import '@logseq/libs'

/**
 * Download a cover image into the plugin's sandbox asset storage and
 * return the markdown image ref to embed as the `cover` property.
 *
 * Files are stored under
 *   assets/storages/<plugin-id>/<subfolder>/<isbn>.jpg
 * (sandbox storage is the only path a 0.0.17 plugin can reliably write;
 * the relative ref still renders and is graph-portable).
 *
 * Returns '' if the image can't be fetched/stored so the caller can
 * fall back to the remote URL.
 */
export const downloadCover = async (
  imgUrl: string,
  isbnOrSlug: string,
  subfolder: string,
): Promise<string> => {
  if (!imgUrl || !isbnOrSlug) return ''
  const storage = logseq.Assets.makeSandboxStorage() as IAsyncStorage
  const rel = `${subfolder}/${isbnOrSlug}.jpg`
  const marker = `${isbnOrSlug}-${subfolder}`
  const coverMd = `![${isbnOrSlug}](../assets/storages/${logseq.baseInfo.id}/${rel})`

  try {
    if ((await storage.hasItem(rel)) as boolean) {
      // Already downloaded — offline-safe, dedupes re-adds.
      return coverMd
    }
  } catch (e) {
    console.warn('logseq-reading-list: storage.hasItem failed', e)
  }

  try {
    const response = await fetch(imgUrl.replace(/^http:/, 'https:'))
    if (!response.ok) {
      console.warn('logseq-reading-list: cover fetch failed', response.status, imgUrl)
      return ''
    }
    const blob = await response.blob()
    const content = await blobToBinaryString(blob)
    await storage.setItem(rel, content)
    console.log('logseq-reading-list: saved cover', rel, marker)
    return coverMd
  } catch (e) {
    console.warn('logseq-reading-list: cover download failed', e)
    return ''
  }
}

/**
 * FileReader is callback-based; wrap it in a promise so the caller can
 * await the saved file before creating the page (upstream did not await,
 * causing a race where the cover ref pointed at a not-yet-written file).
 */
function blobToBinaryString(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(reader.error)
    reader.onload = () => {
      const buf = reader.result as ArrayBuffer
      const bytes = new Uint8Array(buf)
      let binary = ''
      const chunk = 0x8000
      for (let i = 0; i < bytes.length; i += chunk) {
        binary += String.fromCharCode.apply(
          null,
          bytes.subarray(i, i + chunk) as unknown as number[],
        )
      }
      resolve(binary)
    }
    reader.readAsArrayBuffer(blob)
  })
}
