/**
 * Storage. Two files, one rule: the curated file is never written by the
 * pipeline.
 *
 *   src/data/live.json      machine-fetched, rewritten each run
 *   src/data/overrides.json human decisions (merges, pins, bans)
 *
 * Overrides are how a human stays in the loop without editing generated output.
 */

import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { dirname } from 'node:path'

export async function readJson(path, fallback) {
  try {
    return JSON.parse(await readFile(path, 'utf8'))
  } catch {
    return fallback
  }
}

export async function writeJson(path, data) {
  await mkdir(dirname(path), { recursive: true })
  await writeFile(path, JSON.stringify(data, null, 2) + '\n', 'utf8')
}

/**
 * Apply human overrides to generated stories.
 *
 * overrides.json:
 * {
 *   "pin":   ["key1"],                    // force into today's issue
 *   "ban":   ["key2"],                    // never publish
 *   "title": { "key3": "Better title" },  // replace a bad auto-title
 *   "why":   { "key4": { "en": "...", "zh": "..." } },
 *   "where": { "key4": { "en": "...", "zh": "..." } }
 * }
 */
export function applyOverrides(stories, overrides) {
  if (!overrides) return stories
  const ban = new Set(overrides.ban ?? [])

  return stories
    .filter((s) => !ban.has(s.key))
    .map((s) => {
      const next = { ...s }
      if (overrides.title?.[s.key]) next.title = overrides.title[s.key]
      if (overrides.why?.[s.key]) next.why = overrides.why[s.key]
      if (overrides.where?.[s.key]) next.where = overrides.where[s.key]
      if (overrides.pin?.includes(s.key)) next.pinned = true
      return next
    })
}

/**
 * Merge today's fetch with what we already had, keyed by entity key.
 * Re-running the same day updates in place rather than duplicating — that is
 * what makes the 2x/day schedule safe.
 */
export function mergeStories(previous, fresh, { retainDays = 14 } = {}) {
  const map = new Map(previous.map((s) => [s.key, s]))

  for (const s of fresh) {
    const old = map.get(s.key)
    if (old) {
      // Re-fetched content replaces the stored copy. Keeping the old summary to
      // "preserve" it means a fixed parser never reaches records already on disk,
      // so stale formatting (leaked HTML, old titles) would persist forever.
      // Only human-authored prose survives.
      map.set(s.key, {
        ...s,
        why: s.why ?? old.why,
        where: s.where ?? old.where,
        firstSeenAt: old.firstSeenAt ?? s.firstSeenAt,
      })
    } else {
      map.set(s.key, { ...s, firstSeenAt: new Date().toISOString() })
    }
  }

  // Drop records that have aged out and were never consolidated.
  //
  // Also strip markup from anything carried over: a parser fix only reaches
  // records re-fetched this run, and previously-stored summaries may still hold
  // markup the old parser failed to remove.
  const cutoff = Date.now() - retainDays * 86_400_000
  const kept = [...map.values()]
    .filter((s) => {
      if (s.sources.length > 1) return true // keep corroborated stories longer
      return Date.parse(s.primaryDate) >= cutoff
    })
    .map((s) => ({ ...s, summary: plainerText(s.summary), title: plainerText(s.title) }))

  return kept.sort((a, b) => b.primaryDate.localeCompare(a.primaryDate))
}

/** Last-line defence against markup reaching the rendered page. */
function plainerText(s) {
  if (typeof s !== 'string') return s
  const pass = (v) => v.replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<[^>]+>/g, ' ')
  const decode = (v) =>
    v
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#0?39;|&apos;/g, "'")
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')

  // Collapse runs of spaces but preserve newlines: release notes are line
  // structured, and flattening them here would undo the splitting done at fetch
  // time and turn every changelog back into one unreadable paragraph.
  return pass(decode(pass(decode(s))))
    .split('\n')
    .map((line) => line.replace(/[ \t]+/g, ' ').trim())
    .filter(Boolean)
    .join('\n')
    .trim()
}
