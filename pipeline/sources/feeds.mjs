/**
 * Blog / newsletter feeds.
 *
 * These are tiered deliberately. `signal` feeds are discovery — they can add a
 * source to a story and can set its `signal lead`, but a story with only signal
 * sources is held back from the daily issue. `context` feeds never anchor a
 * story at all; they exist for durable interpretation.
 *
 * Only feeds verified reachable from this environment are listed. Feeds that
 * returned proxy-intercept pages or login walls are excluded rather than
 * silently broken.
 */

import { getText, getJson } from '../lib/fetch.mjs'
import { parseFeed } from '../lib/rss.mjs'
import { classifyBeats, isRelevant, extractTags } from '../lib/classify.mjs'

export const BLOG_FEEDS = [
  // Primary: official engineering blogs, first-party claims.
  { id: 'hf-blog', name: 'Hugging Face Blog', url: 'https://huggingface.co/blog/feed.xml', tier: 'primary', kind: 'blog', weight: 6, maxItems: 12 },
  { id: 'qwen-blog', name: 'Qwen Blog', url: 'https://qwenlm.github.io/blog/index.xml', tier: 'primary', kind: 'blog', weight: 6, maxItems: 8 },
  { id: 'google-research', name: 'Google Research Blog', url: 'https://blog.research.google/feeds/posts/default', tier: 'primary', kind: 'blog', weight: 5, maxItems: 8 },
  { id: 'msr', name: 'Microsoft Research', url: 'https://www.microsoft.com/en-us/research/feed/', tier: 'primary', kind: 'blog', weight: 5, maxItems: 8 },
  { id: 'aws-ml', name: 'AWS Machine Learning Blog', url: 'https://aws.amazon.com/blogs/machine-learning/feed/', tier: 'primary', kind: 'blog', weight: 4, maxItems: 8 },

  // Signal: discovery only. Treated as leads, never anchors.
  { id: 'latent-space', name: 'Latent Space', url: 'https://www.latent.space/feed', tier: 'signal', kind: 'blog', weight: 5, maxItems: 6 },
  { id: 'raschka', name: 'Ahead of AI', url: 'https://magazine.sebastianraschka.com/feed', tier: 'signal', kind: 'blog', weight: 4, maxItems: 5 },

  // Context: interpretation. Never surfaces as a standalone story.
  { id: 'lillog', name: "Lil'Log", url: 'https://lilianweng.github.io/index.xml', tier: 'context', kind: 'blog', weight: 5, maxItems: 5 },
  { id: 'simonw', name: 'Simon Willison', url: 'https://simonwillison.net/atom/everything/', tier: 'context', kind: 'blog', weight: 4, maxItems: 8 },
]

const MAX_AGE_DAYS = 10

function recent(iso) {
  if (!iso) return true
  return (Date.now() - Date.parse(iso)) / 86_400_000 <= MAX_AGE_DAYS
}

/**
 * Hacker News via the Algolia index rather than the RSS feed.
 *
 * The plain `hnrss.org/newest?points=200` feed is mostly non-AI front-page news,
 * so almost nothing survives the beat classifier and the signal tier ends up
 * empty. Searching by topic gives posts that are actually about this desk's
 * subjects — and crucially, some of them link straight to an arXiv page, which
 * is what lets the consolidator attach a lead to its paper.
 */
const HN_QUERIES = ['LLM agents', 'inference serving', 'reinforcement learning', 'coding agent']

async function fetchHackerNews() {
  const out = []
  const since = Math.floor((Date.now() - 3 * 86_400_000) / 1000)
  const seen = new Set()

  for (const q of HN_QUERIES) {
    const url =
      'https://hn.algolia.com/api/v1/search_by_date?tags=story' +
      `&query=${encodeURIComponent(q)}` +
      `&numericFilters=points%3E30,created_at_i%3E${since}` +
      '&hitsPerPage=40'

    const r = await getJson(url, { timeout: 20000, retries: 1 })
    if (!r.ok || !Array.isArray(r.data?.hits)) continue

    for (const h of r.data.hits) {
      if (!h.title || !h.objectID || seen.has(h.objectID)) continue
      seen.add(h.objectID)

      // The source URL must be the discussion page, not the linked article.
      // If it were the article URL, consolidating the lead into its paper would
      // dedupe it away by URL and the signal would vanish — which is exactly the
      // bug that kept signalLeadDays at zero. The linked article rides along in
      // `referencedUrl` so the clusterer can still match on it.
      const discussion = `https://news.ycombinator.com/item?id=${h.objectID}`
      const date = h.created_at ? h.created_at.slice(0, 10) : ''

      out.push({
        title: h.title,
        link: discussion,
        referencedUrl: h.url || '',
        summary: `Hacker News discussion${h.url ? ` linking ${h.url}` : ''}, ${h.points ?? 0} points, ${h.num_comments ?? 0} comments.`,
        date,
        points: h.points ?? 0,
      })
    }
  }
  return out
}

export async function fetchBlogs() {
  const items = []
  const health = { id: 'blogs', name: 'Blogs & newsletters', ok: false, count: 0, error: null, live: [] }

  for (const feed of BLOG_FEEDS) {
    const r = await getText(feed.url, { timeout: 20000, retries: 2 })
    if (!r.ok) {
      health.error = health.error ?? `${feed.id}: ${r.error}`
      continue
    }
    health.ok = true

    const entries = parseFeed(r.body).filter((e) => recent(e.date)).slice(0, feed.maxItems)
    let kept = 0

    for (const e of entries) {
      const summary = (e.summary || e.content || '').slice(0, 600)
      const beats = classifyBeats({ title: e.title, summary })
      if (!beats.length || !isRelevant({ title: e.title, summary, beats })) continue

      kept++
      items.push({
        key: `blog:${feed.id}:${e.link}`,
        source: {
          name: feed.name,
          url: e.link,
          date: e.date,
          tier: feed.tier,
          kind: feed.kind,
        },
        title: e.title,
        summary,
        beats,
        tags: extractTags({ title: e.title, summary, beats }),
        weight: feed.weight,
        meta: { feedId: feed.id },
      })
    }

    if (kept) health.live.push(`${feed.id}:${kept}`)
  }

  // Hacker News is special-cased because its fetcher differs; it stays in the
  // same signal tier and goes through the same classifier below.
  const hn = await fetchHackerNews()
  let hnKept = 0
  for (const h of hn) {
    if (!recent(h.date)) continue
    const beats = classifyBeats({ title: h.title, summary: h.summary })
    if (!beats.length) continue
    hnKept++
    items.push({
      key: `blog:hn:${h.link}`,
      source: { name: 'Hacker News', url: h.link, date: h.date, tier: 'signal', kind: 'blog' },
      title: h.title,
      summary: h.summary,
      beats,
      tags: extractTags({ title: h.title, summary: h.summary, beats }),
      weight: Math.min(5, Math.log2(h.points + 1)),
      meta: { feedId: 'hn', points: h.points },
    })
  }
  if (hnKept) health.live.push(`hn:${hnKept}`)

  health.count = items.length
  return { items, health }
}
