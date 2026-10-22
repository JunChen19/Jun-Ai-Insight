import type { Lang } from '../lib/i18n'
import { t } from '../lib/i18n'
import type { Filters, FacetCounts, SortMode, ScopeFilter } from '../lib/search'
import { BEAT_LABEL, KIND_LABEL, TIER_LABEL } from '../lib/types'
import type { Beat, ArtifactKind, SourceTier } from '../lib/types'

interface Props {
  filters: Filters
  counts: FacetCounts
  lang: Lang
  sort: SortMode
  onSort: (s: SortMode) => void
  onChange: (f: Filters) => void
}

function toggle<T>(list: T[], value: T): T[] {
  return list.includes(value) ? list.filter((x) => x !== value) : [...list, value]
}

const BEATS: Beat[] = ['ai-coding', 'agents', 'rl', 'ai-infra', 'multimodal', 'policy']
const KINDS: ArtifactKind[] = ['paper', 'release', 'commit', 'spec', 'changelog', 'benchmark', 'policy', 'blog']
const TIERS: SourceTier[] = ['primary', 'signal', 'context']

export default function Facets({ filters, counts, lang, sort, onSort, onChange }: Props) {
  const active = filters.beats.length + filters.kinds.length + filters.tiers.length > 0

  return (
    <aside className="facets">
      {active && (
        <button
          className="clear-btn"
          style={{ marginBottom: 14, paddingLeft: 0 }}
          // Scope is a default, not a filter you "clear" — resetting it would
          // silently dump the raw crawl back into the results.
          onClick={() => onChange({ ...filters, beats: [], kinds: [], tiers: [] })}
        >
          ✕ {t('clear', lang)}
        </button>
      )}

      <div className="facet-group">
        <div className="facet-title">
          <span>{t('scope', lang)}</span>
        </div>
        <div className="facet-list">
          {(['curated', 'machine'] as ScopeFilter[]).map((sc) => {
            const n = counts.scope.get(sc) ?? 0
            return (
              <button
                key={sc}
                className="facet"
                data-on={filters.scope.includes(sc)}
                data-empty={n === 0}
                onClick={() => onChange({ ...filters, scope: toggle(filters.scope, sc) })}
              >
                <span className="facet-dot" />
                {sc === 'curated' ? t('scopeCurated', lang) : t('scopeMachine', lang)}
                <span className="facet-count">{n}</span>
              </button>
            )
          })}
        </div>
      </div>

      <div className="facet-group">
        <div className="facet-title">
          <span>{t('beat', lang)}</span>
        </div>
        <div className="facet-list">
          {BEATS.map((b) => {
            const n = counts.beats.get(b) ?? 0
            return (
              <button
                key={b}
                className="facet"
                data-on={filters.beats.includes(b)}
                data-empty={n === 0}
                onClick={() => onChange({ ...filters, beats: toggle(filters.beats, b) })}
              >
                <span className="facet-dot" />
                {BEAT_LABEL[b][lang]}
                <span className="facet-count">{n}</span>
              </button>
            )
          })}
        </div>
      </div>

      <div className="facet-group">
        <div className="facet-title">
          <span>{t('kind', lang)}</span>
        </div>
        <div className="facet-list">
          {KINDS.map((k) => {
            const n = counts.kinds.get(k) ?? 0
            return (
              <button
                key={k}
                className="facet"
                data-on={filters.kinds.includes(k)}
                data-empty={n === 0}
                onClick={() => onChange({ ...filters, kinds: toggle(filters.kinds, k) })}
              >
                <span className="facet-dot" />
                {KIND_LABEL[k][lang]}
                <span className="facet-count">{n}</span>
              </button>
            )
          })}
        </div>
      </div>

      <div className="facet-group">
        <div className="facet-title">
          <span>{t('tier', lang)}</span>
        </div>
        <div className="facet-list">
          {TIERS.map((tr) => {
            const n = counts.tiers.get(tr) ?? 0
            return (
              <button
                key={tr}
                className="facet"
                data-on={filters.tiers.includes(tr)}
                data-empty={n === 0}
                onClick={() => onChange({ ...filters, tiers: toggle(filters.tiers, tr) })}
              >
                <span className="facet-dot" />
                {TIER_LABEL[tr][lang]}
                <span className="facet-count">{n}</span>
              </button>
            )
          })}
        </div>
      </div>

      <div className="facet-group">
        <div className="facet-title"><span>Sort</span></div>
        <div className="facet-list">
          {(['recent', 'sources', 'lag'] as SortMode[]).map((s) => (
            <button key={s} className="facet" data-on={sort === s} onClick={() => onSort(s)}>
              <span className="facet-dot" />
              {s === 'recent' ? t('sortRecent', lang) : s === 'sources' ? t('sortSources', lang) : t('sortLag', lang)}
            </button>
          ))}
        </div>
      </div>
    </aside>
  )
}
