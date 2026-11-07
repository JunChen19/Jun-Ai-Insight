/**
 * LLM completion of the two editorial fields (`why` / `where`).
 *
 * The pipeline's contract is that `how` comes from fetched text and `why` /
 * `where` are *editorial judgement* it must not invent. This module is the
 * explicitly-switched opt-out from that rule: when INSIGHT_LLM_ENRICH=1, an LLM
 * drafts both fields for the top-scoring stories that lack them. Records it
 * touches are marked `enrichedBy: 'llm'` so the UI labels them AI-assisted
 * rather than letting them pass as human-reviewed copy.
 *
 * Off by default (README documents this); a run without the switch behaves
 * exactly as before. Transport shells out to curl for the same TLS-through-
 * corporate-proxy reason as translate.mjs.
 */

import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

/** Per-run cap so a wide-open switch cannot burn an unbounded number of calls. */
export const MAX_PER_RUN = 12

export function enrichEnabled() {
  return (
    process.env.INSIGHT_LLM_ENRICH === '1' &&
    Boolean(process.env.ANTHROPIC_AUTH_TOKEN)
  )
}

function proxyUrl() {
  if (process.env.HTTPS_PROXY || process.env.https_proxy) {
    return process.env.HTTPS_PROXY || process.env.https_proxy
  }
  try {
    const line = readFileSync(resolve(process.env.USERPROFILE || '.', '.npmrc'), 'utf8')
      .split(/\r?\n/)
      .find((l) => l.startsWith('proxy='))
    return line ? line.slice(6).trim() : null
  } catch {
    return null
  }
}

const SYSTEM = `You are the desk editor of a technical intelligence site covering RL, AI agents, AI coding and AI infrastructure. For each record you receive (title, fetched summary, source list), draft exactly two fields:

- "why": one or two sentences on why this matters — the implication, not a restatement of the summary.
- "where": one sentence on where it applies, ending with a scope bound ("Bounds: ...") naming what not to over-generalise to.

Rules: grounded in the given text only; no invented numbers, dates or claims; English plain and terse, Chinese natural technical writing (术语如 PPO/rollout/vLLM 保留原文); each field under 60 words / 100 汉字. Reply with ONLY a JSON object: {"why":{"en":"","zh":""},"where":{"en":"","zh":""}}`

/**
 * One LLM call. Returns null on any failure — enrichment is best-effort and
 * must never block the data pipeline.
 */
function complete(story, { timeout = 90 } = {}) {
  const base = process.env.ANTHROPIC_BASE_URL || 'https://api.anthropic.com'
  const model = process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-6'
  const url = `${base.replace(/\/$/, '')}/v1/messages`

  const user = [
    `Title: ${story.title}`,
    `Primary date: ${story.primaryDate}`,
    `Beats: ${(story.beats ?? []).join(', ')}`,
    `Sources: ${(story.sources ?? []).map((s) => `${s.name} (${s.tier}, ${s.date})`).join('; ')}`,
    `Fetched text:\n${(story.summary ?? '').slice(0, 3500)}`,
  ].join('\n')

  const body = JSON.stringify({
    model,
    max_tokens: 2000,
    system: SYSTEM,
    messages: [{ role: 'user', content: user }],
  })

  const args = [
    '-sS', '-m', String(timeout), '--ssl-no-revoke',
    '-X', 'POST',
    '-H', `x-api-key: ${process.env.ANTHROPIC_AUTH_TOKEN}`,
    '-H', `authorization: Bearer ${process.env.ANTHROPIC_AUTH_TOKEN}`,
    '-H', 'anthropic-version: 2023-06-01',
    '-H', 'content-type: application/json',
    '--data-binary', '@-',
    url,
  ]
  const proxy = proxyUrl()
  if (proxy) args.push('-x', proxy)

  const res = spawnSync('curl', args, { input: body, encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 })
  if (res.status !== 0 || !res.stdout) return null

  let payload
  try {
    payload = JSON.parse(res.stdout)
  } catch {
    return null
  }
  // Thinking-capable models put a `thinking` block first; the text we want is
  // the first block of type "text".
  const text = payload?.content?.find((b) => b?.type === 'text')?.text
  if (!text) return null

  // The model is told to reply with JSON only; tolerate a fenced block.
  const m = text.match(/\{[\s\S]*\}/)
  if (!m) return null
  try {
    const out = JSON.parse(m[0])
    const pick = (f, l) =>
      typeof out?.[f]?.[l] === 'string' && out[f][l].trim() ? out[f][l].trim() : null
    const why = { en: pick('why', 'en'), zh: pick('why', 'zh') }
    const where = { en: pick('where', 'en'), zh: pick('where', 'zh') }
    if (!why.en || !why.zh || !where.en || !where.zh) return null
    return { why, where }
  } catch {
    return null
  }
}

/**
 * Fill `why`/`where` on the highest-scoring stories that lack them, in place.
 * Human overrides already applied upstream are never touched. Returns the
 * number enriched.
 */
export async function enrichStories(stories, { max = MAX_PER_RUN, onProgress } = {}) {
  const todo = stories
    .filter((s) => !s.why || !s.where)
    .sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
    .slice(0, max)

  let done = 0
  let filled = 0
  for (const s of todo) {
    const out = complete(s)
    if (out) {
      s.why = s.why ?? out.why
      s.where = s.where ?? out.where
      s.enrichedBy = 'llm'
      filled++
    }
    done++
    if (onProgress) onProgress(done, todo.length)
  }
  return filled
}
