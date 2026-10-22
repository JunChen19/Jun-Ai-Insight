/**
 * Presentation-layer text hygiene.
 *
 * The pipeline strips markup at fetch time, but the corpus accumulates: a
 * record stored before a parser fix keeps its old summary until the same entity
 * is re-fetched, which may never happen for a pinned version. Rather than rely
 * on every historical path being clean, scrub on the way to the DOM.
 *
 * The double decode/strip is deliberate: feeds escape their HTML, so resolving
 * entities can manufacture tags that a single strip would have already missed.
 */
export function scrubMarkup(input: string): string {
  if (typeof input !== 'string') return input

  const strip = (v: string) =>
    v.replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<[^>]*>/g, ' ')

  const decode = (v: string) =>
    v
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#0?39;|&apos;/g, "'")
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')

  return strip(decode(strip(decode(input)))).replace(/\s+/g, ' ').trim()
}
