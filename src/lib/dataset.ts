import type { Dataset, Story, Beat, ArtifactKind, Source } from '../lib/types'
import seed from '../data/dataset.json'
import live from '../data/live.json'
import health from '../data/health.json'
import { scrubMarkup } from './text'

/**
 * Two corpora, one view.
 *
 * `seed` records are hand-written and reviewed. `live` records are fetched by
 * `pipeline/build.mjs` and are *not* translated or edited; every one carries
 * `machine: true` so the UI can say so instead of passing them off as curated.
 *
 * The pipeline writes a flatter, fetch-shaped record than the site needs, so
 * `adaptLive` is the seam between them. Keeping the mapping here (rather than
 * shaping the pipeline around the UI) means the pipeline can change its output
 * without the components noticing.
 */
const seedData = seed as unknown as Dataset

interface LiveSource {
  name: string
  url: string
  date: string
  tier: 'primary' | 'signal' | 'context'
  kind: string
}

interface LiveStory {
  key: string
  title: string
  summary: string
  primaryDate: string
  sources: LiveSource[]
  beats: string[]
  tags: string[]
  signalLeadDays: number | null
  score: number
  why?: { en: string; zh: string }
  where?: { en: string; zh: string }
}

interface LiveFile {
  generatedAt: string
  stories: LiveStory[]
  issues?: LiveIssue[]
}

interface LiveIssue {
  id: string
  date: string
  headline: { en: string; zh: string }
  dek: { en: string; zh: string }
  deskTake: { en: string; zh: string }[]
  signals: { storyId: string; text: { en: string; zh: string } }[]
  sections: { beat: Beat; storyIds: string[] }[]
  tags: string[]
}

const liveFile = live as unknown as LiveFile

const VALID_BEATS: Beat[] = ['ai-coding', 'agents', 'rl', 'ai-infra', 'multimodal', 'policy']

/** Sanitise a slug from an arbitrary key. */
function slug(key: string): string {
  return key.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase().slice(0, 80)
}

/** Turn a release body / abstract into something readable in a paragraph. */
function plainText(s: string): string {
  return scrubMarkup(s)
}

function adaptLive(s: LiveStory): Story {
  const beats = s.beats.filter((b): b is Beat => (VALID_BEATS as string[]).includes(b))
  const kinds = [...new Set(s.sources.map((x) => x.kind))] as ArtifactKind[]

  // The fetched body is the only honest source for "how it works". `why` and
  // `where` are left as explicit placeholders rather than invented.
  const body = plainText(s.summary)

  return {
    id: `live-${slug(s.key)}`,
    machine: true,
    title: { en: s.title, zh: s.title },
    standfirst: { en: body.slice(0, 240), zh: '尚未翻译。以下摘要为抓取原文。' },
    how: {
      en: body,
      zh: '机制摘要待补——抓取条目仅记录原文，不臆造结论。',
    },
    why: s.why ?? {
      en: 'Not assessed yet — this record was fetched automatically.',
      zh: '尚未评估——此条目为自动抓取。',
    },
    where: s.where ?? {
      en: 'Scope not yet defined.',
      zh: '适用范围尚未界定。',
    },
    beats: beats.length ? beats : ['agents'],
    kinds: kinds.length ? kinds : ['paper'],
    tags: s.tags,
    sources: s.sources.map(
      (x): Source => ({
        name: x.name,
        url: x.url,
        date: x.date,
        tier: x.tier,
        kind: (x.kind as ArtifactKind) ?? 'blog',
      }),
    ),
    // Keep the pipeline's own date so the timeline matches what was fetched.
    issue: undefined,
  }
}

const seedIds = new Set(seedData.stories.map((s) => s.id))
const adaptedLive = (liveFile.stories ?? [])
  .map(adaptLive)
  .filter((s) => !seedIds.has(s.id))

/**
 * Issue sections reference pipeline keys, but the UI navigates by adapted ids.
 * Build the mapping once so a daily issue links into the same records the
 * search view serves — an issue entry that can't be opened is worse than none.
 */
const keyToId = new Map<string, string>()
for (const s of liveFile.stories ?? []) keyToId.set(s.key, `live-${slug(s.key)}`)

const liveIssues = (liveFile.issues ?? []).map((iss) => ({
  ...iss,
  sections: iss.sections
    .map((sec) => ({
      beat: sec.beat,
      storyIds: sec.storyIds.map((k) => keyToId.get(k)).filter((x): x is string => Boolean(x)),
    }))
    .filter((sec) => sec.storyIds.length),
  signals: iss.signals
    .map((sig) => ({ ...sig, storyId: keyToId.get(sig.storyId) ?? '' }))
    .filter((sig) => sig.storyId),
}))

/**
 * Issues come from the fetched corpus. The curated demo issues are dropped when
 * real ones exist — showing a hand-written "daily" next to a fetched one would
 * misrepresent where the content came from.
 */
export const dataset: Dataset = {
  generatedAt: liveFile.generatedAt || seedData.generatedAt,
  stories: [...seedData.stories, ...adaptedLive],
  issues: liveIssues.length ? liveIssues : seedData.issues,
  radar: seedData.radar,
}

/** The fetched corpus alone, for stats that must not mix in demo records. */
export const liveData: Dataset = {
  generatedAt: liveFile.generatedAt,
  stories: adaptedLive,
  issues: liveIssues,
  radar: [],
}

export const liveStats = {
  generatedAt: liveFile.generatedAt ?? null,
  count: adaptedLive.length,
}

export const curatedData: Dataset = {
  generatedAt: seedData.generatedAt,
  stories: seedData.stories,
  issues: seedData.issues,
  radar: seedData.radar,
}

export interface SourceHealth {
  id: string
  name: string
  ok: boolean
  count: number
  error: string | null
}

export interface Health {
  startedAt: string
  finishedAt?: string
  durationMs?: number
  sources: SourceHealth[]
  counts?: {
    rawItems: number
    stories: number
    newStories: number
    corroborated: number
    withSignalLead: number
  }
  guardFailed?: boolean
  guardReasons?: string[]
}

export const pipelineHealth = health as unknown as Health
