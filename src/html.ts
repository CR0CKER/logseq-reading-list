/**
 * Single, complete HTML-escaper shared by every place that builds markup
 * with `innerHTML` / interpolated template strings (the search modal in
 * the plugin iframe and the grid renderer in Logseq's main DOM).
 *
 * Escapes the full set — `& < > " '` — so a value is safe in BOTH an
 * element text node AND a double/single-quoted attribute. Book titles,
 * authors, publishers and cover URLs all originate from third-party APIs
 * (Open Library records are publicly editable), so any of them can carry
 * an XSS payload; this is the one function that neutralises it.
 *
 * Two divergent local escapers used to live in modal.ts (`escAttr`,
 * missing `>`) and readingList.ts (`esc`) — exactly the drift that let a
 * value reach `innerHTML` unescaped. Keep it one function, used everywhere.
 */
export function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}
