/**
 * Consolidation. This is the step that makes the site different from a feed
 * reader: N artifacts about one event become one record with an N-item source
 * stack, and we can then say which source got there first.
 *
 * Three passes, in increasing fuzziness:
 *   1. exact entity key   (arxiv:2410.12345, gh:owner/repo@v1.2.3)
 *   2. cross-reference    (a blog/HN item whose text names an arXiv id)
 *   3. title similarity   (only inside a 7-day window, high threshold)
 *
 * Anything that fails all three stays separate. Over-merging is worse than
 * under-merging: a false merge invents a corroboration that doesn't exist.
 */

const STOP = new Set([
  'the', 'a', 'an', 'of', 'for', 'and', 'or', 'to', 'in', 'on', 'with', 'via',
  'from', 'by', 'at', 'is', 'are', 'as', 'that', 'this', 'we', 'our', 'using',
  'based', 'towards', 'toward', 'new', 'via', 'how', 'why', 'what',
])

function tokens(title) {
  return new Set(
    title
      .toLowerCase()
      .replace(/[^a-z0-9一-鿿 ]+/g, ' ')
      .split(/\s+/)
      .filter((w) => w.length > 2 && !STOP.has(w)),
  )
}

function jaccard(a, b) {
  if (!a.size || !b.size) return 0
  let inter = 0
  for (const x of a) if (b.has(x)) inter++
  return inter / (a.size + b.size - inter)
}

function daysBetween(a, b) {
  if (!a || !b) return Infinity
  return Math.abs(Date.parse(a) - Date.parse(b)) / 86_400_000
}

/**
 * Pull arXiv ids referenced anywhere a signal item might point.
 *
 * Checks the item's own URL as well as its text: a Hacker News or blog post
 * that *links* to a paper is exactly the "signal anticipates primary" case this
 * site is built to surface, and those posts almost never paste the id into the
 * title or body.
 */
function referencedArxivIds(text, url = '') {
  const blob = `${text} ${url}`
  return [...blob.matchAll(/arxiv\.org\/(?:abs|pdf)\/([0-9]{4}\.[0-9]{4,5})|arxiv:([0-9]{4}\.[0-9]{4,5})/gi)]
    .map((m) => m[1] || m[2])
    .filter(Boolean)
    .map((id) => id.replace(/v\d+$/, ''))
}

const TITLE_SIMILARITY_THRESHOLD = 0.75
const SIMILARITY_WINDOW_DAYS = 7

/**
 * @param {Array} items  flat list from every source
 * @returns {Array} clusters, each { key, items, sources, title, ... }
 */
export function cluster(items) {
  const byKey = new Map()

  // Pass 1 — exact entity key.
  for (const item of items) {
    const bucket = byKey.get(item.key) ?? []
    bucket.push(item)
    byKey.set(item.key, bucket)
  }

  let clusters = [...byKey.entries()].map(([key, list]) => ({
    key,
    items: list,
  }))

  // Pass 2 — cross-reference: an item naming an arXiv id joins that cluster.
  const arxivIndex = new Map()
  for (const c of clusters) {
    for (const it of c.items) {
      if (it.meta?.arxivId) arxivIndex.set(it.meta.arxivId, c)
    }
  }

  const merged = []
  const absorbed = new Set()

  for (const c of clusters) {
    if (absorbed.has(c)) continue
    const ids = new Set()
    for (const it of c.items) {
      if (it.meta?.arxivId) ids.add(it.meta.arxivId)
      // Include the item's own URL and any article it points at: for an
      // aggregator post those are different, and the paper lives in the latter.
      const urls = [it.source?.url ?? '', it.referencedUrl ?? ''].join(' ')
      for (const ref of referencedArxivIds(`${it.title} ${it.summary}`, urls)) {
        ids.add(ref)
      }
    }

    for (const id of ids) {
      const target = arxivIndex.get(id)
      if (target && target !== c && !absorbed.has(target)) {
        target.items.push(...c.items)
        absorbed.add(c)
        break
      }
    }
    if (!absorbed.has(c)) merged.push(c)
  }

  clusters = merged

  // Pass 3 — title similarity, same-beat, same-week only.
  const out = []
  for (const c of clusters) {
    const cTitle = c.items[0].title
    const cTokens = tokens(cTitle)
    const cDate = c.items[0].source.date
    let host = null

    for (const h of out) {
      if (daysBetween(cDate, h.items[0].source.date) > SIMILARITY_WINDOW_DAYS) continue
      if (!h.items[0].beats.some((b) => c.items[0].beats.includes(b))) continue
      if (jaccard(tokens(h.items[0].title), cTokens) >= TITLE_SIMILARITY_THRESHOLD) {
        host = h
        break
      }
    }

    if (host) host.items.push(...c.items)
    else out.push({ key: c.key, items: [...c.items] })
  }

  return out.map(finalize)
}

/**
 * Turn a cluster into a story-shaped record.
 *
 * Field provenance is explicit:
 *   title/summary  ← the primary item with the longest body (usually HF or a release)
 *   date           ← earliest *primary* source, never the discovery date
 *   why / where    ← left empty on purpose; the UI shows "not assessed"
 */
function finalize(cluster) {
  // Deduplicate sources by url.
  const seen = new Set()
  const sources = []
  for (const it of cluster.items) {
    for (const s of [it.source, ...(it.extraSources ?? [])]) {
      const sig = s.url
      if (seen.has(sig)) continue
      seen.add(sig)
      sources.push(s)
    }
  }

  // Primary first, earliest first — this is the order the UI displays.
  const rank = { primary: 0, signal: 1, context: 2 }
  sources.sort((a, b) => rank[a.tier] - rank[b.tier] || a.date.localeCompare(b.date))

  const primaries = sources.filter((s) => s.tier === 'primary')
  if (!primaries.length) return null // no anchor → not admissible

  // Pick the richest body among primary items.
  const bodySource = [...cluster.items]
    .filter((it) => it.source.tier === 'primary')
    .sort((a, b) => (b.summary?.length ?? 0) - (a.summary?.length ?? 0))[0]

  const beats = [...new Set(cluster.items.flatMap((it) => it.beats))]
  const tags = [...new Set(cluster.items.flatMap((it) => it.tags ?? []))].slice(0, 6)

  const primaryDate = primaries.reduce((min, s) => (s.date < min ? s.date : min), primaries[0].date)
  const signalDates = sources.filter((s) => s.tier === 'signal').map((s) => s.date)
  const earliestSignal = signalDates.length ? signalDates.reduce((a, b) => (a < b ? a : b)) : null

  // The number the reference site never shows: did a lead beat the artifact?
  let signalLeadDays = null
  if (earliestSignal) {
    const d = Math.round((Date.parse(primaryDate) - Date.parse(earliestSignal)) / 86_400_000)
    if (d > 0) signalLeadDays = d
  }

  const weight = Math.max(...cluster.items.map((it) => it.weight ?? 0))

  return {
    key: cluster.key,
    title: bodySource?.title ?? cluster.items[0].title,
    summary: bodySource?.summary ?? cluster.items[0].summary ?? '',
    primaryDate,
    sources,
    beats: beats.length ? beats : ['agents'],
    tags,
    signalLeadDays,
    weight,
    score: score(cluster, sources, primaries, signalLeadDays, weight, primaryDate),
    meta: cluster.items.map((it) => it.meta).filter(Boolean),
  }
}

/**
 * Ranking score for picking what makes the daily issue.
 *
 * Deliberately simple and explainable. The old version maxed out through the
 * `quality` term on every single-source story, so everything tied at the same
 * number and ranking did nothing. Each term now saturates only when it should:
 *
 *   weight        the source's editorial weight (repo priority, HF votes)
 *   corroboration rises sharply with distinct outlet names, since that is the
 *                 actual evidence of importance
 *   freshness     decays over ~3 days so the issue stays current
 *   topicPrior    a small, explicit tiebreak toward the beats this desk covers
 */
function score(cluster, sources, primaries, signalLeadDays, weight, primaryDate) {
  const outlets = new Set(sources.map((s) => s.name))
  const corroboration = Math.min(4, (outlets.size - 1) * 2)

  const ageDays = Math.max(0, (Date.now() - Date.parse(primaryDate)) / 86_400_000)
  const freshness = Math.max(0, 3 - ageDays * 0.5)

  const lead = signalLeadDays ? Math.min(2, signalLeadDays * 0.4) : 0

  const beats = cluster.items[0]?.beats ?? []
  const topicPrior = beats.includes('rl') || beats.includes('ai-infra') ? 0.6 : 0.3

  // Tiny deterministic jitter so ties don't all resolve the same way.
  const jitter = (hashString(cluster.key) % 100) / 1000

  return Number((weight + corroboration + freshness + lead + topicPrior + jitter).toFixed(3))
}

function hashString(s) {
  let h = 0
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0
  return Math.abs(h)
}

/**
 * Cap the corpus per day per beat.
 *
 * arXiv alone would drown everything: 700+ papers pass the beat filter on a
 * given day, and a search index where every seventh result is an unrelated
 * preprint is not more useful than a smaller, sharper one. Per-beat quotas keep
 * the index broad without letting one firehose set the tone.
 *
 * Two classes bypass the quota:
 *   - corroborated stories (multiple distinct outlets) — losing these loses the
 *     entire consolidation premise
 *   - signal-lead stories (a lead carried the news before the artifact) — these
 *     are the rarest and most distinctive records the pipeline produces
 */
const DEFAULT_DAILY_CAP = 100
const BEAT_CAP = {
  'ai-coding': 18,
  agents: 25,
  rl: 22,
  'ai-infra': 22,
  multimodal: 8,
  policy: 6,
}

export function applyQuotas(stories, { dailyCap = DEFAULT_DAILY_CAP } = {}) {
  const byDay = new Map()
  for (const s of stories) {
    const list = byDay.get(s.primaryDate) ?? []
    list.push(s)
    byDay.set(s.primaryDate, list)
  }

  const out = []
  for (const [day, list] of byDay) {
    const perBeat = new Map()
    const kept = []

    for (const s of list) {
      const distinctOutlets = new Set(s.sources.map((x) => x.name)).size

      // Reserved classes first, so a quota can never starve them.
      if (distinctOutlets > 1 || s.signalLeadDays) {
        kept.push(s)
        for (const b of s.beats) perBeat.set(b, (perBeat.get(b) ?? 0) + 1)
        continue
      }

      let admitted = false
      for (const b of s.beats) {
        const used = perBeat.get(b) ?? 0
        if (used < (BEAT_CAP[b] ?? 10)) {
          perBeat.set(b, used + 1)
          admitted = true
          break
        }
      }
      if (admitted) kept.push(s)
    }

    out.push(...kept.slice(0, dailyCap))
    if (kept.length > dailyCap) {
      console.log(`  note: ${day} capped at ${dailyCap} (had ${kept.length})`)
    }
  }

  return out.sort((a, b) => b.primaryDate.localeCompare(a.primaryDate))
}
