/**
 * Translation for the Chinese view.
 *
 * Uses Google's public gtx endpoint — no key, no quota dashboard, and it
 * deliberately leaves mixed-language technical text readable. The trade-off is
 * quality on domain terms, which `glossary.mjs` handles.
 *
 * Transport note: this deliberately shells out to curl rather than using the
 * shared fetch helper. Requests issued from Node's OpenSSL stack get a 429
 * anti-bot page from translate.googleapis.com — with no User-Agent, a curl UA,
 * or a full browser UA alike — while identical requests through curl's schannel
 * stack succeed. The difference is TLS-level, so headers can't fix it.
 *
 * Two rules keep this honest and cheap:
 *   1. Never translate something already Chinese, or a URL, or a bare version.
 *   2. Cache everything by content hash, so a re-run only pays for new text.
 */

import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { protect, restore } from './glossary.mjs'

const ENDPOINT = 'https://translate.googleapis.com/translate_a/single'

/** Inputs longer than this are truncated rather than sent; gtx caps around 5k. */
const MAX_CHARS = 4500

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

/** Reuse the same proxy the rest of the pipeline uses. */
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

/**
 * Cheap language check. We only need to know "is this already Chinese", not the
 * language of arbitrary text — anything with a meaningful share of CJK
 * characters is left alone.
 */
export function looksChinese(text) {
  if (!text) return false
  const cjk = (text.match(/[一-鿿]/g) ?? []).length
  return cjk / Math.max(1, text.length) > 0.2
}

/** Text that must never be sent to a translator. */
export function isUntranslatable(text) {
  if (!text || !text.trim()) return true
  // Pure identifiers, versions, URLs.
  if (/^\s*(https?:\/\/|v?\d+(\.\d+)*[\w.-]*)\s*$/i.test(text)) return true
  // Too short to be prose — a single token or number.
  if (text.trim().split(/\s+/).length < 3) return true
  if (looksChinese(text)) return true
  return false
}

/** The gtx response is [[[segment, original, ...], ...], ...]; join the segments. */
function parseGtx(body) {
  try {
    const data = JSON.parse(body)
    if (!Array.isArray(data?.[0])) return null
    return data[0]
      .map((seg) => (Array.isArray(seg) ? seg[0] : ''))
      .filter((s) => typeof s === 'string' && s)
      .join('')
  } catch {
    return null
  }
}

/**
 * Translate one string. Returns the original text on failure rather than
 * throwing — a translator outage must not take down the data pipeline.
 *
 * Multi-line input is translated line by line and rejoined. gtx silently drops
 * newlines and can reorder bullets, so sending a whole changelog as one blob
 * destroys the list structure that makes it readable.
 */
export async function translateText(text, { timeout = 25 } = {}) {
  if (isUntranslatable(text)) return text

  const lines = text.split('\n').filter((l) => l.trim())
  if (lines.length > 1) {
    const out = []
    for (const line of lines) {
      out.push(await translateLine(line, timeout))
    }
    return out.join('\n')
  }

  return translateLine(text, timeout)
}

async function translateLine(text, timeout) {
  if (isUntranslatable(text)) return text

  const clipped = text.length > MAX_CHARS ? text.slice(0, MAX_CHARS) : text
  const { guarded, mapping } = protect(clipped)

  const url = `${ENDPOINT}?client=gtx&sl=en&tl=zh-CN&dt=t&q=${encodeURIComponent(guarded)}`
  const args = ['-sS', '-m', String(timeout), '--ssl-no-revoke']
  const proxy = proxyUrl()
  if (proxy) args.push('-x', proxy)
  args.push(url)

  const res = spawnSync('curl', args, { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 })
  if (res.status !== 0 || !res.stdout) return text

  const out = parseGtx(res.stdout)
  if (!out) return text

  return restore(out, mapping)
}

/**
 * Translate many strings with bounded concurrency.
 *
 * gtx has no documented rate limit but drops connections under load, so this
 * stays deliberately gentle. `cache` is a plain object keyed by the source
 * string, persisted by the caller across runs.
 */
export async function translateBatch(
  texts,
  { concurrency = 3, delayMs = 120, cache = {}, onProgress } = {},
) {
  const unique = [...new Set(texts.filter((t) => t && !isUntranslatable(t)))]
  const pending = unique.filter((t) => !(t in cache))

  let done = 0
  const results = { ...cache }
  const queue = [...pending]

  const workers = Array.from({ length: Math.min(concurrency, queue.length) }, async () => {
    while (queue.length) {
      const text = queue.shift()
      const zh = await translateText(text)
      // Only cache a real translation; a failure returns the input unchanged,
      // and caching that would permanently pin the English text.
      if (zh !== text) results[text] = zh
      done++
      if (onProgress && done % 10 === 0) onProgress(done, pending.length)
      if (delayMs) await sleep(delayMs)
    }
  })

  await Promise.all(workers)
  return results
}
