/**
 * GitHub Releases.
 *
 * Uses the .atom feed rather than the REST API: no token needed, no 60/hour
 * anonymous rate limit shared across 29 repos, and the feed already carries the
 * release body we need for the "how it works" field.
 *
 * A release is only interesting if it says something. Auto-generated
 * "Full Changelog" bodies are dropped — a version number alone is not a story.
 */

import { getText } from '../lib/fetch.mjs'
import { parseFeed } from '../lib/rss.mjs'
import { REPOS } from '../lib/classify.mjs'
import { classifyBeats, extractTags } from '../lib/classify.mjs'

const MAX_AGE_DAYS = 14

function daysAgo(iso) {
  if (!iso) return Infinity
  return (Date.now() - Date.parse(iso)) / 86_400_000
}

/**
 * Release bodies are noisy; keep the first real sentence or two.
 *
 * Order matters: strip markup *before* truncating. Truncating first can leave a
 * half-written tag like `<a class="iss` with no closing `>`, which then survives
 * tag-stripping and lands in the rendered summary as literal attribute text.
 */
function condense(body) {
  if (!body) return ''
  const cleaned = body
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<\/(li|p|h[1-6]|tr|div)>/gi, '\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<li[^>]*>/gi, '• ')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/\*\*Full Changelog\*\*[\s\S]*$/i, ' ')
    .replace(/^#+\s*/gm, '')
    .trim()

  // GitHub's atom feed flattens the release body to a single line, so HTML list
  // markers are gone by the time we see it. Recover the item boundaries from
  // the conventional changelog shape instead: each entry starts with a
  // conventional-commit prefix or an imperative lead-in.
  const ENTRY_START =
    /(?=\b(?:fix|feat|chore|docs|refactor|perf|test|build|ci|revert|style)\s*\([^)]{1,30}\)\s*:|\b(?:Added|Fixed|Improved|Changed|Removed|Updated|Introduced|Deprecated|Bumped|Support|Enable|Allow|Make|Avoid|Ensure|Prevent|Migrate|Upgrade|Downgrade|Release)\b)/g

  const broken = cleaned.replace(ENTRY_START, '\n')
  return broken
    .split('\n')
    .map((line) => line.replace(/[ \t]+/g, ' ').trim())
    .filter(Boolean)
    .slice(0, 14)
    .join('\n')
    .slice(0, 1200)
    .trim()
}

/**
 * A release is only interesting if it says something. Auto-generated
 * "Full Changelog" bodies are dropped — a version number alone is not a story.
 */
function isSubstantive(title, body) {
  const text = (body || '').trim()
  if (text.length < 40) return false
  // Pure boilerplate: only a changelog link and a version bump.
  const boilerplate = /^(full changelog|what'?s changed|compare)\b/i
  if (boilerplate.test(text) && text.length < 120) return false
  return true
}

/**
 * Some repos ship many times a day (llama.cpp builds are numbered b11775,
 * b11776, …). One paper-worthy release is a story; forty nightly builds is a
 * log. Keep only the newest few per repo per run.
 */
const PER_REPO_LIMIT = 3

export async function fetchGitHubReleases() {
  const items = []
  const health = { id: 'github', name: 'GitHub Releases', ok: false, count: 0, error: null, repos: 0 }

  for (const { repo, weight } of REPOS) {
    const r = await getText(`https://github.com/${repo}/releases.atom`, {
      timeout: 15000,
      retries: 1,
    })
    if (!r.ok) {
      health.error = health.error ?? `${repo}: ${r.error}`
      continue
    }
    health.ok = true
    health.repos++

    const entries = parseFeed(r.body).slice(0, 5)
    let kept = 0
    for (const e of entries) {
      if (kept >= PER_REPO_LIMIT) break
      if (daysAgo(e.date) > MAX_AGE_DAYS) continue

      const body = condense(e.content || e.summary)
      if (!isSubstantive(e.title, body)) continue

      const tag = e.link.match(/releases\/tag\/(.+)$/)?.[1] ?? ''
      const beats = classifyBeats({ title: e.title, summary: body, repo })
      if (!beats.length) continue

      kept++
      items.push({
        key: `gh:${repo}@${tag || e.date}`,
        source: {
          name: `${repo} · GitHub`,
          url: e.link,
          date: e.date,
          tier: 'primary',
          kind: 'release',
        },
        title: `${repo.split('/')[1]} ${e.title}`.trim(),
        summary: body,
        beats,
        tags: extractTags({ title: e.title, summary: body, beats, repo }),
        weight,
        meta: { repo, tag },
      })
    }
  }

  health.count = items.length
  return { items, health }
}
