import { useCallback, useEffect, useState } from 'react'

export type Lang = 'en' | 'zh'

const LANG_KEY = 'ati.lang'

export function useLang(): [Lang, (l: Lang) => void] {
  const [lang, setLang] = useState<Lang>(() => {
    const stored = localStorage.getItem(LANG_KEY)
    if (stored === 'en' || stored === 'zh') return stored
    return navigator.language.toLowerCase().startsWith('zh') ? 'zh' : 'en'
  })
  useEffect(() => {
    localStorage.setItem(LANG_KEY, lang)
    document.documentElement.lang = lang === 'zh' ? 'zh-CN' : 'en'
  }, [lang])
  return [lang, setLang]
}

/** Shared UI strings. Data strings live in the dataset, not here. */
export const UI = {
  tagline: {
    en: 'A search and consolidation desk for RL, agents and AI infra — every story anchored to a dated artifact.',
    zh: '面向 RL、Agents 与 AI Infra 的检索与整合台——每条消息都锚定在一份带日期的原始件上。',
  },
  navExplore: { en: 'Explore', zh: '检索' },
  navIssues: { en: 'Issues', zh: '日报' },
  navRadar: { en: 'Source radar', zh: '来源雷达' },
  navMethod: { en: 'Method', zh: '方法' },
  searchPlaceholder: { en: 'Search titles, mechanics, tags, sources…', zh: '搜索标题、机制、标签、来源…' },
  sortRecent: { en: 'Newest', zh: '最新' },
  sortSources: { en: 'Most corroborated', zh: '来源最多' },
  sortLag: { en: 'Longest signal lead', zh: '线索领先最久' },
  filters: { en: 'Filters', zh: '筛选' },
  scope: { en: 'Record type', zh: '记录类型' },
  scopeCurated: { en: 'Curated & reviewed', zh: '精编已复核' },
  scopeMachine: { en: 'Auto-fetched', zh: '自动抓取' },
  beat: { en: 'Beat', zh: '领域' },
  kind: { en: 'Artifact', zh: '原始件类型' },
  tier: { en: 'Source tier', zh: '来源等级' },
  clear: { en: 'Clear all', zh: '清空' },
  results: { en: 'stories', zh: '条消息' },
  resultOne: { en: 'story', zh: '条消息' },
  storyCount: { en: 'stories', zh: '条消息' },
  allIssuesKicker: { en: 'All issues', zh: '全部日报' },
  empty: { en: 'Nothing matches. Loosen a filter.', zh: '没有匹配结果，放宽一个筛选条件。' },
  howItWorks: { en: 'How it works', zh: '机制' },
  whyItMatters: { en: 'Why it matters', zh: '意义' },
  whereItApplies: { en: 'Where it applies', zh: '适用范围与边界' },
  sources: { en: 'Sources', zh: '来源' },
  back: { en: 'Back to results', zh: '返回结果' },
  deskTake: { en: 'Desk take', zh: '编辑部判断' },
  signals: { en: 'Signals', zh: '速览' },
  onPage: { en: 'On this page', zh: '本页目录' },
  openStory: { en: 'Read the four fields', zh: '查看四字段' },
  sigLead: { en: 'signal lead', zh: '线索领先' },
  daysEarlier: { en: 'd earlier than the primary', zh: '天早于原始件' },
  corroborated: { en: 'sources merged', zh: '个来源合并' },
  radarDesc: {
    en: 'Three tiers, deliberately kept separate. A signal-tier item is a lead to follow, never a citation.',
    zh: '三层来源，刻意分开。线索级条目只是待跟踪的线索，绝不作为引用。',
  },
  tierPrimary: { en: 'Primary artifacts', zh: '原始件' },
  tierSignal: { en: 'Signal / discovery', zh: '线索与发现' },
  tierContext: { en: 'Context / interpretation', zh: '语境与解读' },
  cadenceDaily: { en: 'daily scan', zh: '每日扫描' },
  cadenceWeekly: { en: 'weekly scan', zh: '每周扫描' },
  sampleNote: {
    en: 'Curated records plus machine-fetched items, labelled separately.',
    zh: '人工精编条目与自动抓取条目，分开标注。',
  },
  machineNote: {
    en: 'Machine-fetched · not yet edited or translated',
    zh: '自动抓取 · 未经编辑与翻译',
  },
  liveStrip: {
    en: 'live records from the last crawl',
    zh: '条抓取记录（上次运行）',
  },
  noLive: {
    en: 'Pipeline has not run yet — showing curated records only.',
    zh: '管线尚未运行——当前仅显示精编条目。',
  },
  crawlStatus: { en: 'Crawl status', zh: '抓取状态' },
  lastRun: { en: 'Last run', zh: '上次运行' },
  sourcesOk: { en: 'sources healthy', zh: '个源正常' },
  fetchedAt: { en: 'fetched', zh: '抓取时间' },
  items: { en: 'items', zh: '条' },
  allHealthy: { en: 'All sources responded.', zh: '所有源均已响应。' },
  degraded: { en: 'Degraded run', zh: '降级运行' },
  guardTripped: { en: 'Publish guard tripped — previous data kept', zh: '发布守卫触发——保留上一版数据' },
  untranslated: {
    en: 'Not translated yet — original below.',
    zh: '尚未翻译，以下为英文原文。',
  },
  machineTranslated: {
    en: 'Machine-translated from the source text',
    zh: '机器翻译，原文为英文',
  },
  allIssues: { en: 'All issues', zh: '全部日报' },
  readIssue: { en: 'Open full issue', zh: '展开整期' },
  langToggle: { en: '中文', zh: 'EN' },
} as const

export type UIKey = keyof typeof UI

export function t(key: UIKey, lang: Lang): string {
  return UI[key][lang]
}

/** Hash router — no dependency, and it survives Gitee Pages without a rewrite rule. */
export function useRoute(): [string, (r: string) => void] {
  const [route, setRoute] = useState(() => window.location.hash.slice(1) || '/')
  useEffect(() => {
    const onHash = () => setRoute(window.location.hash.slice(1) || '/')
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])
  const nav = useCallback((r: string) => {
    window.location.hash = r
    window.scrollTo({ top: 0 })
  }, [])
  return [route, nav]
}
