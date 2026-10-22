import type { Lang } from '../lib/i18n'

const C = {
  rules: [
    {
      en: 'Every story is a record, not a post. Several artifacts about the same event collapse into one record whose Sources stack shows who reported it first.',
      zh: '每条消息都是一条记录，而不是一篇帖子。同一事件的多个原始件收敛为一条记录，其「来源」栈展示谁最先报道。',
    },
    {
      en: 'No story is admissible without a dated primary artifact. The primary date — never the discovery date — is what the timeline sorts on.',
      zh: '没有带日期的原始件就不予收录。时间线按原始件日期排序，而不是发现日期。',
    },
    {
      en: 'Signal-tier sources are leads. They may set the tone of a Signal line, but they never anchor a story on their own.',
      zh: '线索级来源只是线索。它可以决定速览行文的口气，但绝不能单独支撑一条消息。',
    },
    {
      en: 'A "Where it applies" field always ships with its bounds. Over-generalising is the most common failure of AI commentary, so the caveat is part of the field, not a footnote.',
      zh: '「适用范围」字段永远连同边界一起交付。过度推广是 AI 评论最常见的失效方式，所以边界属于字段本身，而不是脚注。',
    },
  ],
  axes: [
    {
      en: 'Beat — what part of the stack the change lands in (AI coding, Agents, RL, AI infra, Multimodal, Policy).',
      zh: '领域——改动落在栈的哪一层（AI 编程、智能体、强化学习、AI 基础设施、多模态、政策监管）。',
    },
    {
      en: 'Artifact — what kind of primary document it is (paper, release, commit, spec, changelog, benchmark, policy, blog).',
      zh: '原始件类型——这份一手材料是什么（论文、版本发布、提交、规范、变更日志、基准评测、政策文件、官方博客）。',
    },
    {
      en: 'Source tier — how much evidentiary weight it carries (primary, signal, context).',
      zh: '来源等级——它承载多少证据权重（原始件、线索、解读）。',
    },
  ],
  pipeline: [
    {
      en: 'A scheduled fetch pulls arXiv, GitHub Releases and changelogs, and the source radar feeds. Items are normalised to one schema, then clustered by entity and title similarity so the same event from two outlets becomes one record.',
      zh: '定时抓取 arXiv、GitHub Releases 与变更日志，以及来源雷达中的订阅源。条目被归一化为统一结构，再按实体与标题相似度聚类，使两家媒体对同一事件的报道合并成一条记录。',
    },
    {
      en: 'The pipeline dates a record by its earliest primary artifact and computes the signal lead — how many days earlier a newsletter surfaced it. That number is shown on the card rather than buried.',
      zh: '管线以最早的原始件为记录标注日期，并计算「线索领先」——订阅源提前多少天提到它。这个数字显示在卡片上，而不是被埋起来。',
    },
    {
      en: 'The current build ships a hand-written seed dataset so the interface can be judged on its own terms. Entries carry a SEED marker; swapping in the live crawl requires no UI change.',
      zh: '当前版本附带一份手写的种子数据集，以便先单独审视界面本身。条目带有 SEED 标记；接入实时抓取不需要改动任何界面代码。',
    },
  ],
}

export default function Method({ lang }: { lang: Lang }) {
  return (
    <div style={{ maxWidth: 780 }}>
      <h1 style={{ fontFamily: 'var(--serif)', fontSize: 34, fontWeight: 500, letterSpacing: '-0.02em', margin: '0 0 8px' }}>
        {lang === 'en' ? 'Method' : '方法'}
      </h1>
      <p style={{ color: 'var(--ink-muted)', fontSize: 16, marginBottom: 34 }}>
        {lang === 'en'
          ? 'Three rules about evidence, three axes for classification, one pipeline that keeps them honest.'
          : '三条关于证据的规则，三个分类轴，一条让它们保持诚实的管线。'}
      </p>

      <Section title={lang === 'en' ? 'Editorial rules' : '编辑规则'} lang={lang}>
        <ol style={listStyle}>
          {C.rules.map((r, i) => (
            <li key={i} style={itemStyle}>{r[lang]}</li>
          ))}
        </ol>
      </Section>

      <Section title={lang === 'en' ? 'Three classification axes' : '三个分类轴'} lang={lang}>
        <ul style={listStyle}>
          {C.axes.map((a, i) => (
            <li key={i} style={itemStyle}>{a[lang]}</li>
          ))}
        </ul>
      </Section>

      <Section title={lang === 'en' ? 'How the pipeline works' : '管线如何工作'} lang={lang}>
        {C.pipeline.map((p, i) => (
          <p key={i} style={{ margin: '0 0 16px', lineHeight: 1.72, fontSize: 15.5 }}>{p[lang]}</p>
        ))}
        <pre style={codeStyle}>{`# fetch + cluster + date, then write src/data/dataset.json
npm run pipeline`}</pre>
      </Section>
    </div>
  )
}

function Section({ title, children }: { title: string; lang: Lang; children: React.ReactNode }) {
  return (
    <section style={{ marginBottom: 38 }}>
      <div className="field-label" style={{ marginBottom: 14 }}>{title}</div>
      {children}
    </section>
  )
}

const listStyle: React.CSSProperties = { margin: 0, paddingLeft: 20, color: 'var(--ink)' }
const itemStyle: React.CSSProperties = { marginBottom: 13, lineHeight: 1.72, fontSize: 15.5 }
const codeStyle: React.CSSProperties = {
  fontFamily: 'var(--mono)',
  fontSize: 12.5,
  background: 'var(--bg-sunken)',
  border: '1px solid var(--line)',
  padding: '12px 14px',
  borderRadius: 4,
  overflowX: 'auto',
  color: 'var(--ink-muted)',
  lineHeight: 1.7,
}
