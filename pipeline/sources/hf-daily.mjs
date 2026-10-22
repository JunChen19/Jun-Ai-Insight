/**
 * HuggingFace Daily Papers — the highest-value source.
 *
 * Community-voted, so the 50/day is already editorially filtered. Each record
 * carries an `ai_summary` and `ai_keywords`, which means the "how it works"
 * field has real, citable text instead of a placeholder.
 *
 * The API needs a `date` param; bare `?limit=` returns an error object.
 */

import { getJson } from '../lib/fetch.mjs'
import { classifyBeats, isRelevant, extractTags } from '../lib/classify.mjs'

const API = 'https://huggingface.co/api/daily_papers'

function ymd(d) {
  return d.toISOString().slice(0, 10)
}

/**
 * @param {string[]} days  ISO dates to fetch, newest first
 */
export async function fetchHFDaily(days) {
  const items = []
  const health = { id: 'hf-daily', name: 'HuggingFace Daily Papers', ok: false, count: 0, error: null }

  for (const day of days) {
    const r = await getJson(`${API}?date=${day}`, { timeout: 25000, retries: 2 })
    if (!r.ok) {
      health.error = r.error
      continue
    }
    if (!Array.isArray(r.data)) {
      health.error = 'unexpected payload shape'
      continue
    }
    health.ok = true

    for (const row of r.data) {
      const p = row.paper
      if (!p?.id || !p?.title) continue

      const arxivId = String(p.id).replace(/v\d+$/, '')
      const title = p.title.trim()
      const summary = (p.ai_summary || p.summary || '').trim()

      const beats = classifyBeats({ title, summary, arxivCategories: ['cs.AI', 'cs.LG'] })
      if (!beats.length) continue
      if (!isRelevant({ title, summary, beats })) continue

      items.push({
        key: `arxiv:${arxivId}`,
        source: {
          name: 'Hugging Face Daily Papers',
          url: `https://huggingface.co/papers/${arxivId}`,
          date: day,
          tier: 'primary',
          kind: 'paper',
        },
        // Same artifact also exists on arXiv; keeping both produces a two-entry
        // source stack, which is the whole point of the consolidation view.
        extraSources: [
          {
            name: 'arXiv',
            url: `https://arxiv.org/abs/${arxivId}`,
            date: p.publishedAt ? ymd(new Date(p.publishedAt)) : day,
            tier: 'primary',
            kind: 'paper',
          },
        ],
        title,
        summary,
        beats,
        tags: extractTags({ title, summary, beats }),
        // Upvotes are the community's own ranking; log keeps a 900-vote paper
        // from being 10x more important than a 90-vote one. Capped well below
        // the scorer's total so it ranks without saturating it.
        weight: Math.min(8, Math.log2((p.upvotes ?? 0) + 1) * 1.2),
        meta: {
          upvotes: p.upvotes ?? 0,
          aiKeywords: p.ai_keywords ?? [],
          arxivId,
          authors: (p.authors ?? []).slice(0, 5).map((a) => a.name),
        },
      })
    }
  }

  health.count = items.length
  return { items, health }
}
