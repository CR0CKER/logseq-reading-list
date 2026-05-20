import '@logseq/libs'

/**
 * The search modal renders inside the plugin's own iframe (so the form is
 * fully scriptable). That iframe does NOT inherit Logseq's `--ls-*` theme
 * variables, so the upstream plugin looked nothing like the user's graph.
 *
 * Strategy: try to read the real Logseq theme variables from the parent
 * document (accessible in the Electron desktop app, where the plugin
 * iframe is same-origin). If that's blocked (web build, sandboxing),
 * fall back to a polished light/dark palette chosen from the user's
 * preferred theme mode. Either way the modal matches the app.
 */

const LS_VARS = [
  '--ls-primary-background-color',
  '--ls-secondary-background-color',
  '--ls-tertiary-background-color',
  '--ls-quaternary-background-color',
  '--ls-primary-text-color',
  '--ls-secondary-text-color',
  '--ls-border-color',
  '--ls-link-text-color',
  '--ls-active-primary-color',
  '--ls-selection-background-color',
] as const

type Palette = Record<string, string>

const LIGHT_FALLBACK: Palette = {
  '--ls-primary-background-color': '#ffffff',
  '--ls-secondary-background-color': '#f7f7f7',
  '--ls-tertiary-background-color': '#efefef',
  '--ls-quaternary-background-color': '#e4e4e4',
  '--ls-primary-text-color': '#1c1c1e',
  '--ls-secondary-text-color': '#6b6b6b',
  '--ls-border-color': '#d8d8d8',
  '--ls-link-text-color': '#2563eb',
  '--ls-active-primary-color': '#1f6feb',
  '--ls-selection-background-color': '#dbeafe',
}

const DARK_FALLBACK: Palette = {
  '--ls-primary-background-color': '#1e2022',
  '--ls-secondary-background-color': '#23272a',
  '--ls-tertiary-background-color': '#2b2f33',
  '--ls-quaternary-background-color': '#34393d',
  '--ls-primary-text-color': '#e6e6e6',
  '--ls-secondary-text-color': '#a0a0a0',
  '--ls-border-color': '#3a3f44',
  '--ls-link-text-color': '#6cb6ff',
  '--ls-active-primary-color': '#4493f8',
  '--ls-selection-background-color': '#2d4a73',
}

// Final fallback when readFontFromParent() returns nothing. Don't hard
// -code Inter here: themes that use a different font would then render
// the popup in Inter instead of their own font. `system-ui` is the OS
// UI font on every platform, the closest neutral default we can pick.
const SYSTEM_FONT =
  'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif'

function readFontFromParent(): string | null {
  try {
    const doc = window.parent?.document
    if (!doc) return null
    const rootVar = window.parent
      .getComputedStyle(doc.documentElement)
      .getPropertyValue('--ls-font-family')
      .trim()
    if (rootVar) return rootVar
    // Fall back to whatever font Logseq actually computes on its body.
    const bodyFont = window.parent.getComputedStyle(doc.body).fontFamily?.trim()
    return bodyFont || null
  } catch {
    return null
  }
}

function readFromParent(): Palette | null {
  try {
    const doc = window.parent?.document
    if (!doc) return null
    const cs = window.parent.getComputedStyle(doc.documentElement)
    const out: Palette = {}
    let hits = 0
    for (const name of LS_VARS) {
      const v = cs.getPropertyValue(name).trim()
      if (v) {
        out[name] = v
        hits++
      }
    }
    return hits >= 4 ? out : null
  } catch {
    // Cross-origin / sandboxed — expected on some builds.
    return null
  }
}

export async function resolvePalette(): Promise<Palette> {
  const fromParent = readFromParent()
  if (fromParent) return { ...DARK_FALLBACK, ...fromParent }
  let mode: string | undefined
  try {
    const cfg = (await logseq.App.getUserConfigs()) as { preferredThemeMode?: string }
    mode = cfg?.preferredThemeMode
  } catch {
    /* ignore */
  }
  const dark = mode
    ? mode === 'dark'
    : window.matchMedia?.('(prefers-color-scheme: dark)').matches
  return dark ? DARK_FALLBACK : LIGHT_FALLBACK
}

export async function applyTheme(): Promise<void> {
  const palette = await resolvePalette()
  const font = readFontFromParent() || SYSTEM_FONT
  palette['--ls-font-family'] = font
  const css = ':root{' + Object.entries(palette).map(([k, v]) => `${k}:${v};`).join('') + '}'
  let style = document.getElementById('lrl-theme-vars') as HTMLStyleElement | null
  if (!style) {
    style = document.createElement('style')
    style.id = 'lrl-theme-vars'
    document.head.appendChild(style)
  }
  style.textContent = css
}

/** Re-apply on Logseq theme changes so an open modal restyles live. */
export function watchTheme(): void {
  logseq.App.onThemeModeChanged(() => {
    void applyTheme()
  })
}
