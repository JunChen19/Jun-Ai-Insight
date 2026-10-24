#!/usr/bin/env node
/**
 * Pipeline entry point.
 *
 *   node pipeline/build.mjs              fetch everything, write live.json
 *   node pipeline/build.mjs --dry-run    fetch and report, write nothing
 *   node pipeline/build.mjs --sources=hf,arxiv   restrict sources (debugging)
 *
 * Design constraints, in order of priority:
 *   1. A dead source must never take down the run.
 *   2. A bad run must never overwrite good data (see the publish guard).
 *   3. Every number written to disk must trace to fetched text.
 */

import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

import { fetchHFDaily } from './sources/hf-daily.mjs'
import { fetchArxiv } from './sources/arxiv-rss.mjs'
import { fetchGitHubReleases } from './sources/github-releases.mjs'
import { fetchBlogs } from './sources/feeds.mjs'
import { cluster, applyQuotas } from './lib/cluster.mjs'
import { classifyBeats, extractTags } from './lib/classify.mjs'
import { resolveMany } from './lib/arxiv-lookup.mjs'
import { readJson, writeJson, mergeStories, applyOverrides } from './lib/store.mjs'
import { buildIssues } from './lib/issue.mjs'
import { translateBatch } from './lib/translate.mjs'
import { hasProxy } from './lib/fetch.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(HERE, '..')
const LIVE = resolve(ROOT, 'src/data/live.json')
const HEALTH = resolve(ROOT, 'src/data/health.json')
const OVERRIDES = resolve(ROOT, 'src/data/overrides.json')
// Translation memory, persisted so re-runs only pay for unseen strings.
// Lives outside the repo like the other pipeline output.
const TRANS_CACHE = resolve(ROOT, '.cache/translations.json')

const args = process.argv.slice(2)
const dryRun = args.includes('--dry-run')
const only = args.find((a) => a.startsWith('--sources='))?.split('=')[1]?.split(',') ?? null

/** Minimum new stories before we accept a run as healthy. */
const MIN_TOTAL_STORIES = 20

function ymd(d) {
  return d.toISOString().slice(0, 10)
}

function daysBack(n) {
  const out = []
  for (let i = 0; i < n; i++) out.push(ymd(new Date(Date.now() - i * 86_400_000)))
  return out
}

async function main() {
  const started = Date.now()
  console.log(`\n=== AI Tech Insight pipeline ===`)
  console.log(`proxy: ${hasProxy() ? 'yes' : 'no'}   dry-run: ${dryRun}   sources: ${only?.join(',') ?? 'all'}\n`)

  const wanted = (id) => !only || only.includes(id)
  const items = []
  const health = { startedAt: new Date().toISOString(), sources: [] }

  // --- fetch, isolating failures ---
  if (wanted('hf')) {
    const { items: got, health: h } = await fetchHFDaily(daysBack(2))
    items.push(...got)
    health.sources.push(h)
    console.log(`  hf-daily        ${h.ok ? 'ok ' : 'ERR'}  ${got.length} kept`)
  }

  if (wanted('arxiv')) {
    const { items: got, health: h } = await fetchArxiv()
    items.push(...got)
    health.sources.push(h)
    console.log(`  arxiv           ${h.ok ? 'ok ' : 'ERR'}  ${got.length} kept of ${h.rawTotal ?? '?'} raw`)
  }

  if (wanted('github')) {
    const { items: got, health: h } = await fetchGitHubReleases()
    items.push(...got)
    health.sources.push(h)
    console.log(`  github          ${h.ok ? 'ok ' : 'ERR'}  ${got.length} kept from ${h.repos} repos`)
  }

  if (wanted('blogs')) {
    const { items: got, health: h } = await fetchBlogs()
    items.push(...got)
    health.sources.push(h)
    console.log(`  blogs           ${h.ok ? 'ok ' : 'ERR'}  ${got.length} kept`)
  }

  console.log(`\n  raw items: ${items.length}`)

  // --- backfill: resolve papers referenced by leads but not in today's RSS ---
  //
  // arXiv RSS only lists today's submissions, but a HN post frequently links a
  // paper from several days ago. Without fetching those, the lead has nowhere
  // to attach and the signal-lead metric can never fire.
  const knownArxiv = new Set(
    items.map((it) => it.meta?.arxivId).filter(Boolean),
  )
  const referenced = new Set()
  for (const it of items) {
    if (it.source.tier !== 'signal') continue
    for (const m of `${it.title} ${it.summary} ${it.source.url} ${it.referencedUrl ?? ''}`.matchAll(
      /arxiv\.org\/(?:abs|pdf)\/([0-9]{4}\.[0-9]{4,5})|arxiv:([0-9]{4}\.[0-9]{4,5})/gi,
    )) {
      referenced.add((m[1] || m[2]).replace(/v\d+$/, ''))
    }
  }
  const toResolve = [...referenced].filter((id) => !knownArxiv.has(id)).slice(0, 25)

  if (toResolve.length) {
    console.log(`  backfilling ${toResolve.length} referenced paper(s)…`)
    const resolved = await resolveMany(toResolve)
    let added = 0
    for (const [id, paper] of resolved) {
      const beats = classifyBeats({
        title: paper.title,
        summary: paper.summary,
        arxivCategories: paper.categories,
      })
      if (!beats.length) continue
      added++
      items.push({
        key: `arxiv:${id}`,
        source: {
          name: 'arXiv',
          url: `https://arxiv.org/abs/${id}`,
          date: paper.date,
          tier: 'primary',
          kind: 'paper',
        },
        title: paper.title,
        summary: paper.summary,
        beats,
        tags: extractTags({ title: paper.title, summary: paper.summary, beats }),
        weight: 2,
        meta: { arxivId: id, backfilled: true },
      })
    }
    console.log(`  backfilled ${added}/${toResolve.length} into the corpus`)
  }

  // --- consolidate ---
  const clustered = cluster(items).filter(Boolean)
  const ranked = [...clustered].sort((a, b) => b.score - a.score)
  const selected = applyQuotas(ranked)
  console.log(`  after clustering: ${clustered.length} stories, ${selected.length} after per-beat quotas`)

  const multi = selected.filter((s) => new Set(s.sources.map((x) => x.name)).size > 1)
  const withLead = selected.filter((s) => s.signalLeadDays)
  console.log(`  corroborated: ${multi.length}   with signal lead: ${withLead.length}`)

  // --- merge with history ---
  const previous = await readJson(LIVE, { stories: [] })
  const overrides = await readJson(OVERRIDES, null)
  const merged = applyOverrides(mergeStories(previous.stories ?? [], selected), overrides)

  const newCount = merged.filter(
    (s) => !(previous.stories ?? []).some((p) => p.key === s.key),
  ).length

  console.log(`  total stories: ${merged.length}  (new this run: ${newCount})`)

  // --- translate ---
  //
  // Titles and summaries are the only prose the site shows, so they are all that
  // gets translated. The cache on disk means a daily run only pays for genuinely
  // new text — typically tens of strings, not hundreds.
  if (!args.includes('--no-translate')) {
    const cache = await readJson(TRANS_CACHE, {})
    const todo = []
    for (const s of merged) {
      todo.push(s.title, s.summary)
    }
    const before = Object.keys(cache).length
    console.log(`  translating… (cache holds ${before})`)

    const filled = await translateBatch(todo, {
      cache,
      concurrency: 3,
      delayMs: 120,
      onProgress: (d, total) => {
        if (d % 25 === 0) process.stdout.write(`\r    ${d}/${total}`)
      },
    })
    process.stdout.write('\r' + ' '.repeat(30) + '\r')

    for (const s of merged) {
      s.titleZh = filled[s.title] ?? s.title
      s.summaryZh = filled[s.summary] ?? s.summary
    }

    await writeJson(TRANS_CACHE, filled)
    console.log(`  translated: ${Object.keys(filled).length - before} new strings`)
  }

  // --- publish guard ---
  //
  // "New stories" is the wrong health signal for a same-day re-run: the second
  // run of the day correctly finds almost nothing new, and tripping the guard
  // there would block legitimate refreshes. What actually matters is whether we
  // produced a usable corpus at all.
  const healthySources = health.sources.filter((s) => s.ok).length
  const guard = []
  if (healthySources === 0) guard.push('no source succeeded')
  else if (healthySources < health.sources.length / 2) guard.push('majority of sources failed')
  if (merged.length < MIN_TOTAL_STORIES) guard.push(`only ${merged.length} stories total (< ${MIN_TOTAL_STORIES})`)
  if (clustered.length === 0) guard.push('clustering produced nothing')

  health.finishedAt = new Date().toISOString()
  health.durationMs = Date.now() - started
  health.counts = {
    rawItems: items.length,
    stories: merged.length,
    newStories: newCount,
    corroborated: multi.length,
    withSignalLead: withLead.length,
  }
  health.guardFailed = guard.length > 0
  health.guardReasons = guard

  if (guard.length) {
    console.warn(`\n  ⚠ publish guard tripped: ${guard.join('; ')}`)
    console.warn(`  → keeping previous data, writing health.json only`)
    if (!dryRun) await writeJson(HEALTH, health)
    console.log(`\n done in ${((Date.now() - started) / 1000).toFixed(1)}s (no publish)\n`)
    return
  }

  if (dryRun) {
    console.log(`\n  dry-run: not writing. Sample of top stories by score:`)
    for (const s of [...merged].sort((a, b) => b.score - a.score).slice(0, 10)) {
      console.log(`   [${s.score.toFixed(1)}] ${s.primaryDate} ${s.sources.length}src  ${s.title.slice(0, 70)}`)
    }
    console.log()
    return
  }

  await writeJson(LIVE, {
    generatedAt: new Date().toISOString(),
    stories: merged,
    // Issues are derived here rather than in the UI so the published data is
    // self-describing: what the site shows is exactly what was built.
    issues: buildIssues(merged),
  })
  await writeJson(HEALTH, health)

  console.log(`\n  wrote ${merged.length} stories → src/data/live.json`)
  console.log(` done in ${((Date.now() - started) / 1000).toFixed(1)}s\n`)
}

main().catch((err) => {
  console.error('\npipeline failed:', err)
  process.exit(1)
})
