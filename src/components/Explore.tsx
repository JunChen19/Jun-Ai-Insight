import { useEffect, useRef } from 'react'
import type { Dataset } from '../lib/types'
import type { Filters, SortMode } from '../lib/search'
import { applyFilters, facetCounts } from '../lib/search'
import type { Lang } from '../lib/i18n'
import { t } from '../lib/i18n'
import Facets from './Facets'
import StoryRow from './StoryRow'

interface Props {
  data: Dataset
  lang: Lang
  filters: Filters
  sort: SortMode
  onFilters: (f: Filters) => void
  onSort: (s: SortMode) => void
  onOpen: (id: string) => void
}

export default function Explore({ data, lang, filters, sort, onFilters, onSort, onOpen }: Props) {
  const results = applyFilters(data.stories, filters, sort)
  const counts = facetCounts(data.stories, filters)
  const inputRef = useRef<HTMLInputElement>(null)

  // "/" focuses search, the one shortcut worth having.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === '/' && document.activeElement?.tagName !== 'INPUT') {
        e.preventDefault()
        inputRef.current?.focus()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  return (
    <div className="explore">
      <Facets
        filters={filters}
        counts={counts}
        lang={lang}
        sort={sort}
        onSort={onSort}
        onChange={onFilters}
      />

      <div>
        <div className="searchbar">
          <input
            ref={inputRef}
            type="search"
            value={filters.query}
            placeholder={t('searchPlaceholder', lang)}
            onChange={(e) => onFilters({ ...filters, query: e.target.value })}
            aria-label={t('searchPlaceholder', lang)}
          />
          <span className="kbd">/</span>
        </div>

        <div className="result-head">
          <span className="result-count">
            {results.length} {results.length === 1 ? t('resultOne', lang) : t('results', lang)}
          </span>
          <div className="sort-row">
            {(['recent', 'sources', 'lag'] as SortMode[]).map((s) => (
              <button key={s} className="sort-btn" data-on={sort === s} onClick={() => onSort(s)}>
                {s === 'recent' ? t('sortRecent', lang) : s === 'sources' ? t('sortSources', lang) : t('sortLag', lang)}
              </button>
            ))}
          </div>
        </div>

        {results.length === 0 ? (
          <div className="empty-state">{t('empty', lang)}</div>
        ) : (
          <div className="story-list">
            {results.map((s) => (
              <StoryRow key={s.id} story={s} lang={lang} onOpen={onOpen} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
