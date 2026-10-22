/**
 * arXiv RSS.
 *
 * The RSS endpoint is used instead of the official API because the API
 * (export.arxiv.org) is unreliable behind the proxy while rss.arxiv.org isn't.
 *
 * Volume is the problem: cs.LG alone is ~800 items/day, most of them
 * `replace` or `cross` announcements rather than new work. We keep only
 * `new`, and then require a real beat match.
 */

import { getText } from '../lib/fetch.mjs'
import { parseFeed } from '../lib/rss.mjs'
import { classifyBeats, isRelevant, extractTags } from '../lib/classify.mjs'

export const ARXIV_FEEDS = [
  { id: 'cs.LG', url: 'https://rss.arxiv.org/rss/cs.LG' },
  { id: 'cs.AI', url: 'https://rss.arxiv.org/rss/cs.AI' },
  { id: 'cs.DC', url: 'https://rss.arxiv.org/rss/cs.DC' },
  { id: 'cs.CL', url: 'https://rss.arxiv.org/rss/cs.CL' },
]

/** arXiv puts its bookkeeping line inside the description; strip it. */
function cleanAbstract(raw) {
  return raw
    .replace(/^arXiv:\S+\s+Announce Type:\s*\w+\s*/i, '')
    .replace(/^Abstract:\s*/i, '')
    .trim()
}

function isNew(entry) {
  // The category lives in the description prefix of the RSS item.
  const m = entry.summary.match(/Announce Type:\s*(\w+)/i)
  if (m) return m[1].toLowerCase() === 'new'
  // If the marker is missing, fall back to trusting it — better to over-include
  // than to silently drop everything if arXiv changes the format.
  return true
}

export async function fetchArxiv() {
  const items = []
  const seen = new Set()
  const health = { id: 'arxiv', name: 'arXiv RSS', ok: false, count: 0, error: null }
  let rawTotal = 0

  for (const feed of ARXIV_FEEDS) {
    const r = await getText(feed.url, { timeout: 30000, retries: 2 })
    if (!r.ok) {
      health.error = `${feed.id}: ${r.error}`
      continue
    }
    health.ok = true
    const entries = parseFeed(r.body)
    rawTotal += entries.length

    for (const e of entries) {
      if (!isNew(e)) continue
      const arxivId = (e.link.match(/abs\/([0-9.]+)/)?.[1] ?? '').replace(/v\d+$/, '')
      if (!arxivId || seen.has(arxivId)) continue

      const summary = cleanAbstract(e.summary)
      const title = e.title.replace(/\s*\(arXiv:[^)]*\)\s*$/i, '').trim()
      const cats = e.categories.length ? e.categories : [feed.id]

      const beats = classifyBeats({ title, summary, arxivCategories: cats })
      if (!beats.length || !isRelevant({ title, summary, beats })) continue

      seen.add(arxivId)
      items.push({
        key: `arxiv:${arxivId}`,
        source: {
          name: 'arXiv',
          url: `https://arxiv.org/abs/${arxivId}`,
          date: e.date,
          tier: 'primary',
          kind: 'paper',
        },
        title,
        summary,
        beats,
        tags: extractTags({ title, summary, beats }),
        // Base weight: arXiv alone is a weak signal, HF's vote count is stronger.
        weight: 2,
        meta: { arxivId, categories: cats },
      })
    }
  }

  health.count = items.length
  health.rawTotal = rawTotal
  return { items, health }
}
