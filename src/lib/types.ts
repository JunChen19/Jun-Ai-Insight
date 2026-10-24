// Shared data model.
//
// The whole site is a view over one flat list of *stories*. A story is an
// event, not an article: several sources about the same thing collapse into a
// single record, with its origins stacked inside `sources`. That is what makes
// "整合" (consolidation) possible — the beat sections and the daily issue are
// just different ways of projecting this one list.

export type Beat = 'ai-coding' | 'agents' | 'rl' | 'ai-infra' | 'multimodal' | 'policy'

export type ArtifactKind =
  | 'paper'
  | 'release'
  | 'commit'
  | 'spec'
  | 'changelog'
  | 'benchmark'
  | 'policy'
  | 'blog'

/** Where a source sits in the editorial trust ladder. */
export type SourceTier = 'primary' | 'signal' | 'context'

/** A single dated artifact backing a story. */
export interface Source {
  /** Literal outlet or artifact name, e.g. "arXiv", "vllm-project/vllm". */
  name: string
  url: string
  /** ISO date, YYYY-MM-DD. Required — undated sources are not admissible. */
  date: string
  tier: SourceTier
  kind: ArtifactKind
  /** Optional localised display label, for sources whose name is a slug. */
  note?: { en: string; zh: string }
}

/** Locale-bound prose. The pipeline fills both; the UI picks one. */
export interface Bilingual {
  en: string
  zh: string
}

export interface Story {
  /** Stable slug; also the anchor and the detail-route id. */
  id: string
  title: Bilingual
  /** One-line standfirst under the headline. */
  standfirst: Bilingual
  /** The four-field body. `bounds` folds in "do not over-generalise" caveats. */
  how: Bilingual
  why: Bilingual
  where: Bilingual
  /** Name of the SVG figure template, from `public/figures`. */
  figure?: string
  beats: Beat[]
  kinds: ArtifactKind[]
  tags: string[]
  /** The canonical (earliest primary) source. Its date is the story's date. */
  sources: Source[]
  /** ID of the daily issue this story was first surfaced in. */
  issue?: string
  /** True when produced by the pipeline from the seed dataset rather than a live crawl. */
  sample?: boolean
  /**
   * True for machine-fetched records. Their four fields are placeholders and
   * their zh text is untranslated — the UI must label them rather than let them
   * pass as edited copy.
   */
  machine?: boolean
  /** True when the zh text is machine translation rather than written copy. */
  translated?: boolean
}

export interface IssueSection {
  beat: Beat
  storyIds: string[]
}

export interface Issue {
  id: string
  /** ISO date. */
  date: string
  headline: Bilingual
  dek: Bilingual
  /** The "Desk take" — two or three paragraphs of editorial judgement. */
  deskTake: Bilingual[]
  /** One-line digest rows that point back at stories. */
  signals: { storyId: string; text: Bilingual }[]
  sections: IssueSection[]
  tags: string[]
}

/** A source we watch, shown in the source radar with its scan cadence. */
export interface RadarSource {
  name: string
  url: string
  desc: Bilingual
  tier: SourceTier
  cadence: 'daily' | 'weekly'
  beats: Beat[]
}

export interface Dataset {
  generatedAt: string
  stories: Story[]
  issues: Issue[]
  radar: RadarSource[]
}

export const BEAT_LABEL: Record<Beat, Bilingual> = {
  'ai-coding': { en: 'AI coding', zh: 'AI 编程' },
  agents: { en: 'Agents', zh: '智能体' },
  rl: { en: 'RL', zh: '强化学习' },
  'ai-infra': { en: 'AI infra', zh: 'AI 基础设施' },
  multimodal: { en: 'Multimodal', zh: '多模态' },
  policy: { en: 'Policy', zh: '政策监管' },
}

export const KIND_LABEL: Record<ArtifactKind, Bilingual> = {
  paper: { en: 'paper', zh: '论文' },
  release: { en: 'release', zh: '版本发布' },
  commit: { en: 'commit', zh: '提交' },
  spec: { en: 'spec', zh: '规范' },
  changelog: { en: 'changelog', zh: '变更日志' },
  benchmark: { en: 'benchmark', zh: '基准评测' },
  policy: { en: 'policy', zh: '政策文件' },
  blog: { en: 'blog', zh: '官方博客' },
}

export const TIER_LABEL: Record<SourceTier, Bilingual> = {
  primary: { en: 'Primary', zh: '原始件' },
  signal: { en: 'Signal', zh: '线索' },
  context: { en: 'Context', zh: '解读' },
}
