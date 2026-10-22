import type { Beat, ArtifactKind, SourceTier, Story, Dataset, Source } from './types'

/**
 * A story's primary date is the date of its *earliest primary source* — not the
 * date it was noticed. Signal-tier sources are leads, so they can never set it.
 */
export function primaryDate(story: Story): string {
  const primaries = story.sources.filter((s) => s.tier === 'primary')
  const pool = primaries.length ? primaries : story.sources
  return pool.reduce((min, s) => (s.date < min ? s.date : min), pool[0]?.date ?? '')
}

/** The canonical source we treat as the story of record. */
export function canonicalSource(story: Story): Source | undefined {
  const primaries = story.sources.filter((s) => s.tier === 'primary')
  const pool = primaries.length ? primaries : story.sources
  return pool.reduce<Source | undefined>(
    (best, s) => (!best || s.date < best.date ? s : best),
    undefined,
  )
}

/**
 * The lead-time delta between a story's first signal and its primary artifact.
 * Positive means the newsletter beat the paper/release to it. This is the number
 * that makes the "signal → primary" upgrade chain visible instead of implied.
 */
export function signalLagDays(story: Story): number | null {
  const primary = canonicalSource(story)
  const signals = story.sources.filter((s) => s.tier === 'signal')
  if (!primary || !signals.length) return null
  const firstSignal = signals.reduce((min, s) => (s.date < min ? s.date : min), signals[0].date)
  const ms = Date.parse(primary.date) - Date.parse(firstSignal)
  if (Number.isNaN(ms)) return null
  return Math.round(ms / 86_400_000)
}

export function sourceTiers(story: Story): SourceTier[] {
  return [...new Set(story.sources.map((s) => s.tier))]
}

/** Everything the text search looks at, in both languages. */
function haystack(story: Story): string {
  return [
    story.title.en,
    story.title.zh,
    story.standfirst.en,
    story.standfirst.zh,
    story.how.en,
    story.how.zh,
    story.why.en,
    story.why.zh,
    story.where.en,
    story.where.zh,
    ...story.tags,
    ...story.sources.map((s) => s.name),
  ]
    .join(' ')
    .toLowerCase()
}

export interface Filters {
  query: string
  beats: Beat[]
  kinds: ArtifactKind[]
  tiers: SourceTier[]
  /** curated = hand-written and reviewed; machine = fetched, four fields pending. */
  scope: ScopeFilter[]
  /** Inclusive ISO date bounds. */
  from?: string
  to?: string
  issue?: string
}

export type ScopeFilter = 'curated' | 'machine'

export const EMPTY_FILTERS: Filters = { query: '', beats: [], kinds: [], tiers: [], scope: [] }

export type SortMode = 'recent' | 'sources' | 'lag'

/**
 * Apply filters. Facets within one axis are OR'd (beat rl OR agents), across
 * axes they are AND'd (rl AND paper) — the behaviour people expect from faceted
 * search, and the thing the reference site cannot do at all.
 */
export function applyFilters(stories: Story[], f: Filters, sort: SortMode): Story[] {
  const q = f.query.trim().toLowerCase()
  const terms = q ? q.split(/\s+/).filter(Boolean) : []

  const out = stories.filter((s) => {
    if (f.beats.length && !f.beats.some((b) => s.beats.includes(b))) return false
    if (f.kinds.length && !f.kinds.some((k) => s.kinds.includes(k))) return false
    if (f.tiers.length && !f.tiers.some((t) => s.sources.some((src) => src.tier === t))) return false
    if (f.issue && s.issue !== f.issue) return false
    if (f.scope.length) {
      const kind: ScopeFilter = s.machine ? 'machine' : 'curated'
      if (!f.scope.includes(kind)) return false
    }

    const d = primaryDate(s)
    if (f.from && d < f.from) return false
    if (f.to && d > f.to) return false

    if (terms.length) {
      const hay = haystack(s)
      // Every term must appear — narrows fast, which is what a search box is for.
      if (!terms.every((t) => hay.includes(t))) return false
    }
    return true
  })

  return sortStories(out, sort)
}

export function sortStories(stories: Story[], sort: SortMode): Story[] {
  const copy = [...stories]
  if (sort === 'recent') {
    copy.sort((a, b) => primaryDate(b).localeCompare(primaryDate(a)))
  } else if (sort === 'sources') {
    // Most-corroborated first: the consolidation view.
    copy.sort((a, b) => b.sources.length - a.sources.length || primaryDate(b).localeCompare(primaryDate(a)))
  } else {
    copy.sort((a, b) => {
      const la = signalLagDays(a) ?? -Infinity
      const lb = signalLagDays(b) ?? -Infinity
      return lb - la || primaryDate(b).localeCompare(primaryDate(a))
    })
  }
  return copy
}

export interface FacetCounts {
  beats: Map<Beat, number>
  kinds: Map<ArtifactKind, number>
  tiers: Map<SourceTier, number>
  scope: Map<ScopeFilter, number>
}

/** Counts are computed against the *other* active axes, so facets stay useful. */
export function facetCounts(stories: Story[], f: Filters): FacetCounts {
  const beats = new Map<Beat, number>()
  const kinds = new Map<ArtifactKind, number>()
  const tiers = new Map<SourceTier, number>()
  const scope = new Map<ScopeFilter, number>()

  // Scope counts describe the whole pool, so they ignore the scope filter itself
  // but honour text/date — otherwise the "auto-fetched" count would vanish the
  // moment you selected "curated".
  const scopeBase = { ...f, beats: [], kinds: [], tiers: [], scope: [] }
  for (const s of applyFilters(stories, scopeBase, 'recent')) {
    const sc: ScopeFilter = s.machine ? 'machine' : 'curated'
    scope.set(sc, (scope.get(sc) ?? 0) + 1)
  }

  // Everything else respects the current scope, so counts match what you see.
  for (const s of applyFilters(stories, f, 'recent')) {
    for (const b of s.beats) beats.set(b, (beats.get(b) ?? 0) + 1)
    for (const k of s.kinds) kinds.set(k, (kinds.get(k) ?? 0) + 1)
    for (const t of sourceTiers(s)) tiers.set(t, (tiers.get(t) ?? 0) + 1)
  }
  return { beats, kinds, tiers, scope }
}

/** Group stories by day for the timeline, newest first. */
export function groupByDay(stories: Story[]): { date: string; stories: Story[] }[] {
  const map = new Map<string, Story[]>()
  for (const s of stories) {
    const d = primaryDate(s)
    map.set(d, [...(map.get(d) ?? []), s])
  }
  return [...map.entries()]
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([date, list]) => ({ date, stories: list }))
}

export function datasetStats(d: Dataset) {
  const totalSources = d.stories.reduce((n, s) => n + s.sources.length, 0)
  const merged = d.stories.filter((s) => s.sources.length > 1).length
  const sound = d.stories.filter((s) => s.sources.some((x) => x.tier === 'primary')).length
  return {
    stories: d.stories.length,
    sources: totalSources,
    merged,
    /** Share of stories ultimately anchored to a dated primary artifact. */
    anchored: d.stories.length ? Math.round((sound / d.stories.length) * 100) : 0,
  }
}

export function fmtDate(iso: string, lang: 'en' | 'zh'): string {
  if (!iso) return ''
  const [y, m, d] = iso.split('-')
  return lang === 'en' ? `${y}-${m}-${d}` : `${y} 年 ${Number(m)} 月 ${Number(d)} 日`
}
