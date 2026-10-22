/**
 * Fetch layer: one place that knows about timeouts, retries, proxies and
 * politeness, so source modules only have to describe *what* to get.
 *
 * Node's fetch ignores HTTPS_PROXY by default. `dispatchProxy` below wires in a
 * minimal CONNECT tunnel so the pipeline works behind a corporate proxy without
 * pulling in a dependency.
 */

import http from 'node:http'
import https from 'node:https'
import tls from 'node:tls'
import { URL } from 'node:url'

const UA = 'ai-tech-insight-pipeline/2.0 (+https://github.com/JunChen19/Jun-Ai-Insight)'

function proxyUrl() {
  return (
    process.env.HTTPS_PROXY ||
    process.env.https_proxy ||
    process.env.HTTP_PROXY ||
    process.env.http_proxy ||
    null
  )
}

/** Open a raw socket through an HTTP proxy using the CONNECT verb. */
function connectViaProxy(proxy, target, timeout) {
  return new Promise((resolve, reject) => {
    const p = new URL(proxy)
    const auth =
      p.username ? 'Basic ' + Buffer.from(`${decodeURIComponent(p.username)}:${decodeURIComponent(p.password)}`).toString('base64') : null

    const req = http.request({
      host: p.hostname,
      port: Number(p.port) || 8080,
      method: 'CONNECT',
      path: `${target.hostname}:${target.port}`,
      headers: auth ? { 'Proxy-Authorization': auth, Host: `${target.hostname}:${target.port}` } : { Host: `${target.hostname}:${target.port}` },
    })

    req.setTimeout(timeout, () => {
      req.destroy(new Error('proxy CONNECT timeout'))
    })
    req.on('connect', (res, socket) => {
      if (res.statusCode !== 200) {
        socket.destroy()
        reject(new Error(`proxy CONNECT ${res.statusCode}`))
        return
      }
      resolve(socket)
    })
    req.on('error', reject)
    req.end()
  })
}

/** GET through the proxy (if configured) and return the decoded body. */
async function getViaProxy(url, { timeout }) {
  const u = new URL(url)
  const proxy = proxyUrl()
  const port = Number(u.port) || (u.protocol === 'https:' ? 443 : 80)

  let socket = null
  if (proxy) {
    socket = await connectViaProxy(proxy, { hostname: u.hostname, port }, timeout)
  }

  return new Promise((resolve, reject) => {
    const isHttps = u.protocol === 'https:'
    const opts = {
      host: proxy ? u.hostname : u.hostname,
      port,
      path: u.pathname + u.search,
      method: 'GET',
      headers: { 'user-agent': UA, accept: '*/*', 'accept-encoding': 'identity' },
    }
    if (isHttps) opts.servername = u.hostname

    const req = isHttps
      ? https.request({ ...opts, createConnection: socket ? () => tls.connect({ socket, servername: u.hostname }) : undefined })
      : http.request({ ...opts, createConnection: socket ? () => socket : undefined })

    req.setTimeout(timeout, () => req.destroy(new Error(`timeout after ${timeout}ms`)))
    req.on('response', (res) => {
      // Follow one redirect; feeds occasionally move hosts.
      if ([301, 302, 307, 308].includes(res.statusCode) && res.headers.location) {
        res.resume()
        const next = new URL(res.headers.location, url).toString()
        req.destroy()
        resolve(getViaProxy(next, { timeout }))
        return
      }
      const chunks = []
      res.on('data', (c) => chunks.push(c))
      res.on('end', () => {
        const body = Buffer.concat(chunks).toString('utf8')
        if (res.statusCode >= 400) {
          reject(new Error(`HTTP ${res.statusCode}`))
          return
        }
        resolve(body)
      })
    })
    req.on('error', reject)
    req.end()
  })
}

/** Plain fetch with a hard timeout, used when no proxy is configured. */
async function getDirect(url, { timeout }) {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), timeout)
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      redirect: 'follow',
      headers: { 'user-agent': UA, accept: '*/*' },
    })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    return await res.text()
  } finally {
    clearTimeout(timer)
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

/**
 * GET with retries. Returns { ok, body, error }. Never throws — a dead feed
 * must not take down the whole run.
 */
export async function getText(url, { timeout = 20000, retries = 2, backoff = 1200 } = {}) {
  let lastErr = null
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const body = proxyUrl() ? await getViaProxy(url, { timeout }) : await getDirect(url, { timeout })
      return { ok: true, body }
    } catch (err) {
      lastErr = err
      if (attempt < retries) await sleep(backoff * (attempt + 1))
    }
  }
  return { ok: false, body: '', error: lastErr?.message ?? 'unknown error' }
}

export async function getJson(url, opts) {
  const r = await getText(url, opts)
  if (!r.ok) return { ok: false, data: null, error: r.error }
  try {
    return { ok: true, data: JSON.parse(r.body) }
  } catch (err) {
    return { ok: false, data: null, error: `bad JSON: ${err.message}` }
  }
}

export function hasProxy() {
  return Boolean(proxyUrl())
}
