#!/usr/bin/env node
/**
 * Make sure src/data/live.json and health.json exist before a build.
 *
 * Both are pipeline output and are deliberately not committed — that keeps the
 * repo small and stops stale data from looking like source. But the site
 * imports them at build time, so a fresh clone (or a CI run where the pipeline
 * failed) would fail to resolve the imports. Writing empty stubs lets the app
 * render its "pipeline has not run" state instead of crashing.
 */

import { existsSync, writeFileSync, mkdirSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const LIVE = resolve(ROOT, 'src/data/live.json')
const HEALTH = resolve(ROOT, 'src/data/health.json')

mkdirSync(dirname(LIVE), { recursive: true })

if (!existsSync(LIVE)) {
  writeFileSync(
    LIVE,
    JSON.stringify({ generatedAt: null, stories: [], issues: [] }, null, 2) + '\n',
    'utf8',
  )
  console.log('live.json absent — wrote an empty stub')
}

// dataset.ts imports this for the crawl-status strip on the explore page.
if (!existsSync(HEALTH)) {
  writeFileSync(
    HEALTH,
    JSON.stringify({ startedAt: null, sources: [] }, null, 2) + '\n',
    'utf8',
  )
  console.log('health.json absent — wrote an empty stub')
}
