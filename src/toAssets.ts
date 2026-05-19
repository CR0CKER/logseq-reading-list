import { IAsyncStorage } from '@logseq/libs/dist/modules/LSPlugin.Storage'
import '@logseq/libs'

/**
 * Download a cover into the plugin's sandbox asset storage and return the
 * relative markdown ref to put in the `cover` property.
 *
 * Proven pattern (used by the upstream author across logseq-plugin-google-books
 * and logseq-plugin-multiple-assets): pass the raw ArrayBuffer to
 * storage.setItem — Logseq's backend writes it as binary. Converting to a
 * string first corrupts the JPEG, which is the "broken cover file" bug.
 *
 * Returns '' on failure so the caller can fall back to the remote URL.
 */
export const saveCoverAsset = async (imgUrl: string, baseName: string): Promise<string> => {
  if (!imgUrl || !baseName) return ''
  const storage = logseq.Assets.makeSandboxStorage() as IAsyncStorage
  const file = `${baseName}.jpg`
  const ref = `../assets/storages/${logseq.baseInfo.id}/${file}`

  try {
    if ((await storage.hasItem(file)) as boolean) return ref // already saved
  } catch (e) {
    console.warn('logseq-reading-list: storage.hasItem failed', e)
  }

  try {
    const res = await fetch(imgUrl.replace(/^http:/, 'https:'))
    if (!res.ok) {
      console.warn('logseq-reading-list: cover fetch failed', res.status, imgUrl)
      return ''
    }
    const blob = await res.blob()
    await new Promise<void>((resolve, reject) => {
      const reader = new FileReader()
      reader.onerror = () => reject(reader.error)
      reader.onload = async () => {
        try {
          await storage.setItem(file, reader.result as any)
          resolve()
        } catch (e) {
          reject(e)
        }
      }
      reader.readAsArrayBuffer(blob)
    })
    return ref
  } catch (e) {
    console.warn('logseq-reading-list: cover save failed', e)
    return ''
  }
}
