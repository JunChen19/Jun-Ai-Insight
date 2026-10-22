/**
 * Dependency-free RSS 2.0 / Atom parser.
 *
 * Handles both formats because the sources are a mix, and handles the specific
 * quirks we hit in practice: CDATA sections, Atom <link href>, RSS <guid>,
 * and feeds that embed HTML in <description>.
 */

function decode(s) {
  return s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&amp;/g, '&')
}

/**
 * Strip markup and return plain text.
 *
 * Two ordering traps, both of which silently produce "clean-looking" output
 * with markup still in it:
 *
 *  1. CDATA must be unwrapped BEFORE tags are removed. `<![CDATA[Title]]>`
 *     matches `<[^>]+>` wholesale — including the text inside.
 *  2. Entities must be decoded BEFORE tags are stripped, and again after.
 *     Feeds routinely escape their HTML (`&lt;p&gt;`), so stripping first finds
 *     nothing and decoding afterwards manufactures brand-new tags that never
 *     get removed.
 */
export function stripHtml(s) {
  const pass = (input) =>
    input
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')

  const unwrapped = String(s).replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')

  // decode → strip → decode → strip: the second round catches tags that only
  // became visible once entities were resolved.
  const once = pass(decode(unwrapped))
  const twice = pass(decode(once))

  return twice.replace(/\s+/g, ' ').trim()
}

/**
 * Pull the first `<tag>...</tag>` out of a block.
 *
 * Built from a string, so every backslash must be doubled once for the string
 * literal and again for the RegExp source. Getting this wrong silently returns
 * '' for every field, which presents as "feed parsed, zero items" — so the
 * escaping lives in one place with a test below.
 */
function pick(block, tag) {
  const re = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, 'i')
  const m = block.match(re)
  return m ? m[1] : ''
}

function pickAttr(block, tag, attr) {
  const re = new RegExp(`<${tag}[^>]*\\b${attr}=["']([^"']+)["']`, 'i')
  const m = block.match(re)
  return m ? m[1] : ''
}

function isoDate(raw) {
  if (!raw) return ''
  const d = new Date(raw.trim())
  return Number.isNaN(d.getTime()) ? '' : d.toISOString().slice(0, 10)
}

/**
 * @returns {{title, link, summary, content, date, id, categories}[]}
 */
export function parseFeed(xml) {
  if (!xml) return []
  const blocks = xml.match(/<item[\s>][\s\S]*?<\/item>|<entry[\s>][\s\S]*?<\/entry>/gi) ?? []

  return blocks
    .map((b) => {
      const isAtom = /^<entry/i.test(b)
      const link = isAtom
        ? pickAttr(b, 'link', 'href') || stripHtml(pick(b, 'link'))
        : stripHtml(pick(b, 'link')) || stripHtml(pick(b, 'guid'))

      const rawSummary = pick(b, 'summary') || pick(b, 'description') || pick(b, 'content')
      const categories = [...b.matchAll(/<category[^>]*?(?:term=["']([^"']+)["']|>([^<]*)<)[^>]*?\/*>/gi)]
        .map((m) => (m[1] || m[2] || '').trim())
        .filter(Boolean)

      return {
        title: stripHtml(pick(b, 'title')),
        link: decode(link).trim(),
        summary: stripHtml(rawSummary),
        content: stripHtml(pick(b, 'content:encoded')),
        date: isoDate(pick(b, 'published') || pick(b, 'updated') || pick(b, 'pubDate') || pick(b, 'dc:date')),
        id: stripHtml(pick(b, 'id') || pick(b, 'guid')),
        categories,
      }
    })
    .filter((it) => it.title && it.link)
}
