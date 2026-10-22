/**
 * Resolve an arXiv id to a citable primary artifact.
 *
 * Needed because of an asymmetry the RSS feeds can't cover: arXiv RSS only
 * carries *today's* listings, while a Hacker News or blog post often links to a
 * paper from days earlier. Without this, a lead that clearly points at a paper
 * has nowhere to attach, and the signal-lead metric never fires.
 *
 * The official API is slow and occasionally flaky behind a proxy, so this is
 * strictly on-demand for ids we already know we need — not a bulk crawler.
 */

import { getText } from './fetch.mjs'

const cache = new Map()

function parseEntry(xml) {
  const entry = xml.match(/<entry>([\s\S]*?)<\/entry>/)?.[1]
  if (!entry) return null

  const title = entry.match(/<title[^>]*>([\s\S]*?)<\/title>/)?.[1]?.replace(/\s+/g, ' ').trim() ?? ''
  const summary = entry.match(/<summary[^>]*>([\s\S]*?)<\/summary>/)?.[1]?.replace(/\s+/g, ' ').trim() ?? ''
  const published = entry.match(/<published>([^<]+)<\/published>/)?.[1] ?? ''
  const cats = [...entry.matchAll(/<category[^>]*term=["']([^"']+)["']/g)].map((m) => m[1])

  if (!title) return null
  return {
    title,
    summary,
    date: published ? published.slice(0, 10) : '',
    categories: cats,
  }
}

/**
 * @param {string} arxivId  bare id, no version suffix
 * @returns {Promise<{title, summary, date, categories}|null>}
 */
export async function resolveArxivPaper(arxivId) {
  if (cache.has(arxivId)) return cache.get(arxivId)

  const r = await getText(`https://export.arxiv.org/api/query?id_list=${arxivId}`, {
    timeout: 25000,
    retries: 1,
  })
  const parsed = r.ok ? parseEntry(r.body) : null
  cache.set(arxivId, parsed)
  return parsed
}

/** Resolve many ids with a small concurrency limit to stay polite. */
export async function resolveMany(arxivIds, { concurrency = 4 } = {}) {
  const out = new Map()
  const queue = [...new Set(arxivIds)]
  const workers = Array.from({ length: Math.min(concurrency, queue.length) }, async () => {
    while (queue.length) {
      const id = queue.shift()
      const paper = await resolveArxivPaper(id)
      if (paper) out.set(id, paper)
    }
  })
  await Promise.all(workers)
  return out
}
