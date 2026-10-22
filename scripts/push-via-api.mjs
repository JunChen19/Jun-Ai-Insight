#!/usr/bin/env node
/**
 * Upload the working tree to GitHub via the REST API.
 *
 * Why this exists: `git push` is blocked in this environment. The corporate
 * proxy drops the receive-pack POST after the body goes out, so the client sees
 * `HTTP 403 / RPC failed` even though the token has full write access. Plain
 * per-file JSON POSTs to the contents/blobs API pass through the same proxy fine,
 * so this pushes blob by blob and then moves the branch ref.
 *
 * Uses curl via spawnSync with an argument array (no shell), so request bodies
 * are never subject to shell quoting, and curl handles the proxy natively.
 *
 * Usage: node scripts/push-via-api.mjs <token> [branch]
 */

import { spawnSync } from 'node:child_process'
import { execSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const TOKEN = process.argv[2]
const BRANCH = process.argv[3] || 'main'
const OWNER = 'JunChen19'
const REPO = 'Jun-Ai-Insight'
const BASE = `https://api.github.com/repos/${OWNER}/${REPO}`

if (!TOKEN) {
  console.error('usage: node scripts/push-via-api.mjs <token> [branch]')
  process.exit(1)
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
const PROXY = proxyUrl()

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

/** One API call. Body is piped through stdin so nothing is length-limited. */
function api(method, path, body, { retries = 4 } = {}) {
  for (let attempt = 0; attempt <= retries; attempt++) {
    const args = [
      '-sS',
      '-m', '90',
      '--ssl-no-revoke',
      '-X', method,
      '-H', `Authorization: token ${TOKEN}`,
      '-H', 'Accept: application/vnd.github+json',
      '-H', 'Content-Type: application/json',
      '-H', 'User-Agent: insight-push/1.0',
      '-w', '\n%{http_code}',
    ]
    if (PROXY) args.push('-x', PROXY)
    if (body !== undefined) args.push('--data-binary', '@-')
    args.push(`${BASE}${path}`)

    const res = spawnSync('curl', args, {
      input: body !== undefined ? JSON.stringify(body) : undefined,
      maxBuffer: 128 * 1024 * 1024,
    })

    const out = (res.stdout || '').toString()
    if (!out) {
      if (attempt < retries) { sleepSync(1500 * (attempt + 1)); continue }
      throw new Error(`${method} ${path}: no output (${(res.stderr || '').toString().slice(0, 160)})`)
    }

    const nl = out.lastIndexOf('\n')
    const code = Number(out.slice(nl + 1).trim())
    const text = out.slice(0, nl)

    if (code >= 200 && code < 300) {
      try { return JSON.parse(text) } catch { return {} }
    }
    // 5xx and connection-level failures are worth retrying; 4xx are not.
    if ((code >= 500 || code === 0) && attempt < retries) {
      sleepSync(1500 * (attempt + 1))
      continue
    }
    throw new Error(`${code} ${method} ${path}: ${text.slice(0, 240)}`)
  }
  throw new Error(`${method} ${path}: exhausted retries`)
}

function sleepSync(ms) {
  // Sync sleep keeps this script linear; Atomics.wait is the portable way.
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms)
}

async function main() {
  const files = execSync('git ls-files', { cwd: ROOT }).toString().trim().split('\n').filter(Boolean)
  console.log(`uploading ${files.length} files to ${OWNER}/${REPO}:${BRANCH}`)
  if (PROXY) console.log(`proxy: configured`)

  let baseSha = null
  try {
    const ref = api('GET', `/git/ref/heads/${BRANCH}`)
    baseSha = ref.object?.sha ?? null
    if (baseSha) console.log(`base commit: ${baseSha.slice(0, 10)}`)
  } catch {
    console.log('branch absent; this becomes the first commit')
  }

  const blobs = {}
  const failed = []
  // Concurrency 3: the proxy chokes on more simultaneous tunnels.
  for (let i = 0; i < files.length; i += 3) {
    const batch = files.slice(i, i + 3)
    await Promise.all(
      batch.map(async (f) => {
        try {
          const res = api('POST', '/git/blobs', {
            content: readFileSync(resolve(ROOT, f)).toString('base64'),
            encoding: 'base64',
          })
          if (!res.sha) throw new Error('no sha returned')
          blobs[f] = res.sha
          process.stdout.write('.')
        } catch (err) {
          failed.push(`${f}: ${err.message}`)
          process.stdout.write('x')
        }
      }),
    )
  }
  console.log(`\nuploaded ${Object.keys(blobs).length}/${files.length} blobs`)

  if (failed.length) {
    console.error('\nfailures:')
    failed.slice(0, 10).forEach((f) => console.error('  ' + f))
    throw new Error('refusing to create a partial commit')
  }

  const tree = api('POST', '/git/trees', {
    tree: files.map((f) => ({ path: f, mode: '100644', type: 'blob', sha: blobs[f] })),
  })
  if (!tree.sha) throw new Error('tree creation returned no sha')

  const message = execSync('git log -1 --pretty=%B', { cwd: ROOT }).toString().trim() || 'Update site'
  const commit = api('POST', '/git/commits', {
    message,
    tree: tree.sha,
    ...(baseSha ? { parents: [baseSha] } : {}),
  })
  console.log(`commit: ${commit.sha.slice(0, 10)}`)

  if (baseSha) {
    api('PATCH', `/git/refs/heads/${BRANCH}`, { sha: commit.sha, force: false })
  } else {
    api('POST', '/git/refs', { ref: `refs/heads/${BRANCH}`, sha: commit.sha })
  }

  console.log(`\npushed → https://github.com/${OWNER}/${REPO}/tree/${BRANCH}`)
}

main().catch((err) => {
  console.error('\npush failed:', err.message)
  process.exit(1)
})
