/**
 * Build the daily issue from the fetched corpus.
 *
 * The issue is a *projection* of the story library, never a separate corpus.
 * That means every issue entry links back to the same record the search view
 * shows, and nothing in an issue can exist that isn't in the library.
 *
 * Deliberately, there is no generated "desk take". An editorial judgement is
 * the one thing a pipeline cannot honestly produce, so the issue ships with a
 * factual dek derived from counts and provenance instead of invented opinion.
 */

const BEAT_ORDER = ['ai-coding', 'agents', 'rl', 'ai-infra', 'multimodal', 'policy']

/** Pick the top stories for a single day, grouped into beats. */
export function buildIssue(stories, date) {
  const dayStories = stories
    .filter((s) => s.primaryDate === date)
    .sort((a, b) => b.score - a.score)

  if (!dayStories.length) return null

  // Cap the issue at a readable length; the rest stay searchable in the library.
  const featured = dayStories.slice(0, 14)

  const sections = []
  for (const beat of BEAT_ORDER) {
    const ids = featured.filter((s) => s.beats.includes(beat)).map((s) => s.key)
    if (ids.length) sections.push({ beat, storyIds: ids })
  }

  const sources = dayStories.flatMap((s) => s.sources)
  const primaries = new Set(sources.filter((x) => x.tier === 'primary').map((x) => x.name))
  const corroborated = dayStories.filter(
    (s) => new Set(s.sources.map((x) => x.name)).size > 1,
  ).length

  return {
    id: `${date}-daily`,
    date,
    // Factual, not editorial: what was collected, from where. The headline says
    // "featured" because the issue shows a curated subset while everything
    // collected stays searchable in the library.
    headline: {
      en: `${featured.length} featured of ${dayStories.length} collected`,
      zh: `精选 ${featured.length} 条，今日共收录 ${dayStories.length} 条`,
    },
    dek: {
      en: `Collected from ${primaries.size} primary outlets. ${corroborated} stories drew on more than one source; each entry links to the artifact it is anchored to.`,
      zh: `来自 ${primaries.size} 个原始渠道。${corroborated} 条由多个来源共同支撑；每条均可回溯到它锚定的原始件。`,
    },
    deskTake: [],
    signals: featured.slice(0, 5).map((s) => ({
      storyId: s.key,
      text: { en: s.title, zh: s.title },
    })),
    sections,
    tags: [...new Set(dayStories.flatMap((s) => s.tags))].slice(0, 6),
  }
}

/** Build issues for every day present in the corpus, newest first. */
export function buildIssues(stories, { maxDays = 7 } = {}) {
  const days = [...new Set(stories.map((s) => s.primaryDate))].sort().reverse().slice(0, maxDays)
  return days.map((d) => buildIssue(stories, d)).filter(Boolean)
}
