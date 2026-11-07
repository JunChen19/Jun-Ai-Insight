/**
 * GitHub Commits for a small watchlist.
 *
 * The reference desk's most valuable items are commit-level: "claude-code adds
 * the privacy mod", "codex applies runtime auth to realtime connections",
 * "vllm lands Kimi K3.1 model files". Releases lag these by days and often
 * bury them in a changelog. The default-branch atom feed is public and needs
 * no token.
 *
 * Not every commit qualifies — a watchlist repo merges dozens of commits a
 * day. Only commits whose message carries a news-value signal (security,
 * breaking, model support, protocol, measured result) are kept, so what
 * survives is the same class of item the reference site writes up.
 */

import { getText } from '../lib/fetch.mjs'
import { parseFeed } from '../lib/rss.mjs'
import { classifyBeats, extractTags, newsValue } from '../lib/classify.mjs'

/** Repos whose commit stream is worth reading, with the branch to watch. */
const WATCHLIST = [
  { repo: 'anthropics/claude-code', weight: 9, beats: ['ai-coding', 'agents'] },
  { repo: 'openai/codex', weight: 9, beats: ['ai-coding', 'agents'] },
  { repo: 'vllm-project/vllm', weight: 9, beats: ['ai-infra'] },
  { repo: 'sgl-project/sglang', weight: 8, beats: ['ai-infra'] },
  { repo: 'modelcontextprotocol/specification', weight: 8, beats: ['agents'] },
  { repo: 'NVIDIA/TensorRT-LLM', weight: 7, beats: ['ai-infra'] },
  { repo: 'volcengine/verl', weight: 7, beats: ['rl'] },
]

const MAX_AGE_DAYS = 7
/** Below this value a commit is engineering, not news. */
const MIN_VALUE = 2

function daysAgo(iso) {
  if (!iso) return Infinity
  return (Date.now() - Date.parse(iso)) / 86_400_000
}

/** The atom entry title is the first line of the commit message. */
function cleanTitle(t) {
  return (t || '').replace(/\s+/g, ' ').trim()
}

export async function fetchGitHubCommits() {
  const items = []
  const health = { id: 'commits', name: 'GitHub Commits', ok: false, count: 0, error: null, repos: 0 }

  for (const { repo, weight, beats: repoBeats } of WATCHLIST) {
    const r = await getText(`https://github.com/${repo}/commits.atom`, {
      timeout: 15000,
      retries: 1,
    })
    if (!r.ok) {
      health.error = health.error ?? `${repo}: ${r.error}`
      continue
    }
    health.ok = true
    health.repos++

    for (const e of parseFeed(r.body).slice(0, 15)) {
      if (daysAgo(e.date) > MAX_AGE_DAYS) continue

      const title = cleanTitle(e.title)
      const summary = cleanTitle(e.content || e.summary)
      if (title.length < 12) continue

      const { value, flags } = newsValue({ title, summary })
      if (value < MIN_VALUE) continue

      const sha = e.link.match(/commit\/([0-9a-f]{7,40})/)?.[1] ?? ''
      const beats = classifyBeats({ title, summary }) || repoBeats

      items.push({
        key: `ghc:${repo}@${sha.slice(0, 10) || e.date}`,
        source: {
          name: `${repo} · GitHub`,
          url: e.link,
          date: e.date,
          tier: 'primary',
          kind: 'commit',
        },
        title: `${repo.split('/')[1]}: ${title}`.slice(0, 160),
        summary: summary && summary !== title ? summary.slice(0, 800) : title,
        beats,
        tags: [...new Set([...flags, ...extractTags({ title, summary, beats, repo })])].slice(0, 6),
        weight,
        meta: { repo, sha, flags },
      })
    }
  }

  health.count = items.length
  return { items, health }
}
