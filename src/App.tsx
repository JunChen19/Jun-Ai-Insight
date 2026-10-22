import { useMemo, useState } from 'react'
import { dataset as data, liveData } from './lib/dataset'
import { useLang } from './lib/i18n'
import { UI, t, useRoute } from './lib/i18n'
import type { Filters, SortMode, ScopeFilter } from './lib/search'
import { datasetStats } from './lib/search'
import Explore from './components/Explore'
import StoryDetail from './components/StoryDetail'
import IssueView from './components/IssueView'
import Radar from './components/Radar'
import Method from './components/Method'
import CrawlStatus from './components/CrawlStatus'

export default function App() {
  const [lang, setLang] = useLang()
  const [route, nav] = useRoute()
  // Default to the machine-fetched corpus. The curated set is a small set of
  // hand-written examples kept for the UI demo; it must never be the first thing
  // a reader sees on a site whose whole claim is "real, dated, traceable".
  const [filters, setFilters] = useState<Filters>({
    query: '',
    beats: [],
    kinds: [],
    tiers: [],
    scope: ['machine'] as ScopeFilter[],
  })
  const [sort, setSort] = useState<SortMode>('recent')

  const storyById = useMemo(() => new Map(data.stories.map((s) => [s.id, s])), [])
  const latestIssue = data.issues[0]
  // Headline numbers describe the real fetched corpus. The curated demo set is
  // reported separately, never mixed in — a stat card must not average fabricated
  // and fetched records into one figure.
  const stats = useMemo(() => datasetStats(liveData), [])

  // Routes: /  |  /story/:id  |  /issues  |  /issue/:id  |  /radar  |  /method
  const parts = route.split('/').filter(Boolean)

  const openNav = (key: string) => nav(key === 'explore' ? '/' : `/${key}`)

  let body: React.ReactNode
  let navKey: string = parts[0] ?? 'explore'

  if (parts[0] === 'story' && parts[1]) {
    const story = storyById.get(parts[1])
    body = story ? (
      <StoryDetail story={story} lang={lang} onBack={() => nav('/')} />
    ) : (
      <div className="empty-state">{t('empty', lang)}</div>
    )
    navKey = 'explore'
  } else if (parts[0] === 'issues') {
    body = (
      <IssueView
        data={data}
        issue={latestIssue}
        lang={lang}
        allIssues
        onOpen={(id) => nav(`/story/${id}`)}
        onOpenIssue={(id) => nav(`/issue/${id}`)}
      />
    )
  } else if (parts[0] === 'issue' && parts[1]) {
    const issue = data.issues.find((i) => i.id === parts[1]) ?? latestIssue
    body = (
      <IssueView
        data={data}
        issue={issue}
        lang={lang}
        allIssues={false}
        onOpen={(id) => nav(`/story/${id}`)}
        onOpenIssue={(id) => nav(`/issue/${id}`)}
      />
    )
    navKey = 'issues'
  } else if (parts[0] === 'radar') {
    body = <Radar data={data} lang={lang} />
  } else if (parts[0] === 'method') {
    body = <Method lang={lang} />
  } else {
    body = (
      <>
        <div className="stats">
          <div>
            <div className="stat-num">{stats.stories}</div>
            <div className="stat-label">{lang === 'en' ? 'Fetched stories' : '抓取消息'}</div>
          </div>
          <div>
            <div className="stat-num">{stats.sources}</div>
            <div className="stat-label">{lang === 'en' ? 'Dated sources' : '带日期来源'}</div>
          </div>
          <div>
            <div className="stat-num">{stats.merged}</div>
            <div className="stat-label">{lang === 'en' ? 'Consolidated' : '已合并事件'}</div>
          </div>
          <div>
            <div className="stat-num">{stats.anchored}%</div>
            <div className="stat-label">{lang === 'en' ? 'Anchored to primary' : '锚定原始件'}</div>
          </div>
        </div>
        <CrawlStatus lang={lang} />
        <Explore
          data={data}
          lang={lang}
          filters={filters}
          sort={sort}
          onFilters={setFilters}
          onSort={setSort}
          onOpen={(id) => nav(`/story/${id}`)}
        />
      </>
    )
    navKey = 'explore'
  }

  const navItems: { key: string; label: string }[] = [
    { key: 'explore', label: t('navExplore', lang) },
    { key: 'issues', label: t('navIssues', lang) },
    { key: 'radar', label: t('navRadar', lang) },
    { key: 'method', label: t('navMethod', lang) },
  ]

  return (
    <div className="app">
      <header className="masthead">
        <div className="masthead-inner">
          <div className="brand-row">
            <a href="#/" className="brand" onClick={(e) => { e.preventDefault(); nav('/') }}>
              AI Tech Insight<em>.</em>
            </a>
            <span className="brand-sub">RL · Agents · Infra</span>
            <div className="masthead-right">
              {latestIssue && (
                <button
                  onClick={() => nav(`/issue/${latestIssue.id}`)}
                  className="lang-btn"
                  style={{ borderColor: 'var(--accent-dim)', color: 'var(--accent)' }}
                >
                  {lang === 'en' ? 'Latest issue →' : '最新一期 →'}
                </button>
              )}
              <button className="lang-btn" onClick={() => setLang(lang === 'en' ? 'zh' : 'en')}>
                {UI.langToggle[lang]}
              </button>
            </div>
          </div>
          <nav className="nav">
            {navItems.map((n) => (
              <button
                key={n.key}
                aria-current={navKey === n.key ? 'page' : undefined}
                onClick={() => openNav(n.key)}
              >
                {n.label}
              </button>
            ))}
          </nav>
        </div>
      </header>

      <main className="main">
        {body}

        <footer className="footer">
          <span>{UI.tagline[lang]}</span>
          <span style={{ marginLeft: 'auto' }}>{UI.sampleNote[lang]}</span>
        </footer>
      </main>
    </div>
  )
}
