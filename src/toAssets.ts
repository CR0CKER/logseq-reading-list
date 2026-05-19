import '@logseq/libs'

/**
 * Fetch a remote cover and return it as a base64 `data:` URI.
 *
 * Why not a real asset file: Logseq's plugin sandbox storage writes the
 * value as a UTF-8 string over an IPC bridge, which corrupts binary JPEG
 * bytes (the "broken cover file" symptom). A data URI is a genuinely
 * local copy — embedded in the graph markdown, offline-safe, portable,
 * and never a broken link. Returns '' on failure so the caller can fall
 * back to the remote URL.
 */
export const fetchCoverDataUri = async (imgUrl: string): Promise<string> => {
  if (!imgUrl) return ''
  try {
    const response = await fetch(imgUrl.replace(/^http:/, 'https:'))
    if (!response.ok) {
      console.warn('logseq-reading-list: cover fetch failed', response.status, imgUrl)
      return ''
    }
    const blob = await response.blob()
    const type = blob.type && blob.type.startsWith('image/') ? blob.type : 'image/jpeg'
    const base64 = await blobToBase64(blob)
    if (!base64) return ''
    return `data:${type};base64,${base64}`
  } catch (e) {
    console.warn('logseq-reading-list: cover download failed', e)
    return ''
  }
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(reader.error)
    reader.onload = () => {
      // result is "data:<type>;base64,<payload>"; keep only the payload.
      const result = String(reader.result || '')
      const comma = result.indexOf(',')
      resolve(comma >= 0 ? result.slice(comma + 1) : '')
    }
    reader.readAsDataURL(blob)
  })
}
