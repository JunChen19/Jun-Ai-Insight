import { pipelineHealth } from '../lib/dataset'
import type { Lang } from '../lib/i18n'
import { t } from '../lib/i18n'
import { fmtDate } from '../lib/search'

/**
 * Crawl status strip.
 *
 * This is the part that makes "the content is real and current" a claim the
 * reader can check, rather than a promise in a footer. Every number comes from
 * health.json, which the pipeline writes whether or not the publish guard
 * tripped.
 */
export default function CrawlStatus({ lang }: { lang: Lang }) {
  const h = pipelineHealth
  if (!h?.startedAt) {
    return (
      <p style={noteStyle}>{t('noLive', lang)}</p>
    )
  }

  const okCount = h.sources.filter((s) => s.ok).length
  const total = h.sources.length
  const allOk = okCount === total && !h.guardFailed

  return (
    <div style={wrapStyle}>
      <span style={dotStyle(allOk)} />
      <strong style={{ color: 'var(--ink-muted)' }}>{t('crawlStatus', lang)}</strong>
      <span style={sep}>·</span>
      <span>
        {t('lastRun', lang)} {fmtDate(h.startedAt.slice(0, 10), lang)}
      </span>
      <span style={sep}>·</span>
      <span style={{ color: allOk ? 'var(--green)' : 'var(--red)' }}>
        {okCount}/{total} {t('sourcesOk', lang)}
      </span>
      {h.counts && (
        <>
          <span style={sep}>·</span>
          <span>
            {h.counts.rawItems} {t('items', lang)} → {h.counts.stories}
          </span>
        </>
      )}
      {h.guardFailed && (
        <>
          <span style={sep}>·</span>
          <span style={{ color: 'var(--red)' }}>{t('guardTripped', lang)}</span>
        </>
      )}
      {h.sources.some((s) => !s.ok) && (
        <span style={{ color: 'var(--ink-faint)', marginLeft: 'auto', fontSize: 11 }}>
          {h.sources.filter((s) => !s.ok).map((s) => s.name).join(', ')}
        </span>
      )}
    </div>
  )
}

const wrapStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  flexWrap: 'wrap',
  fontFamily: 'var(--mono)',
  fontSize: 11,
  color: 'var(--ink-faint)',
  padding: '9px 0',
  borderBottom: '1px solid var(--line-soft)',
  marginBottom: 8,
}

const noteStyle: React.CSSProperties = {
  fontFamily: 'var(--mono)',
  fontSize: 11.5,
  color: 'var(--ink-faint)',
  margin: '0 0 10px',
}

const sep = { color: 'var(--line)' } as React.CSSProperties

const dotStyle = (ok: boolean): React.CSSProperties => ({
  width: 6,
  height: 6,
  borderRadius: '50%',
  background: ok ? 'var(--green)' : 'var(--red)',
  flex: 'none',
  boxShadow: ok ? '0 0 6px rgba(127,168,127,0.5)' : 'none',
})
