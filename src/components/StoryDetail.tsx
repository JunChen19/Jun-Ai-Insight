import type { Story } from '../lib/types'
import { TIER_LABEL } from '../lib/types'
import type { Lang } from '../lib/i18n'
import { t } from '../lib/i18n'
import { canonicalSource, primaryDate, signalLagDays } from '../lib/search'
import { BeatChips, KindChips, MachineChip, MergeChip, SeedChip } from './Chips'

interface Props {
  story: Story
  lang: Lang
  onBack: () => void
}

/**
 * Detail view. The four fields are the core contract: mechanism, implication,
 * scope-with-bounds, and the dated source stack. Sources are ordered primary
 * first so the "follow the lead to its artifact" chain reads top-down.
 */
export default function StoryDetail({ story, lang, onBack }: Props) {
  const sorted = [...story.sources].sort((a, b) => {
    const rank = { primary: 0, signal: 1, context: 2 }
    return rank[a.tier] - rank[b.tier] || a.date.localeCompare(b.date)
  })
  const lag = signalLagDays(story)
  const canonical = canonicalSource(story)

  return (
    <article className="detail">
      <button className="back-link" onClick={onBack}>
        ← {t('back', lang)}
      </button>

      <div className="story-meta" style={{ marginBottom: 12 }}>
        <span>{primaryDate(story)}</span>
        <span>·</span>
        <BeatChips story={story} lang={lang} max={3} />
        <KindChips story={story} lang={lang} max={2} />
        <MergeChip story={story} lang={lang} />
        <MachineChip story={story} lang={lang} />
        <SeedChip story={story} lang={lang} />
      </div>

      <h1>{story.title[lang]}</h1>
      <p className="detail-standfirst">
        {story.machine && lang === 'zh' ? story.standfirst.en : story.standfirst[lang]}
      </p>

      {story.machine && (
        <div
          style={{
            border: '1px solid #3a2c2c',
            background: 'rgba(201,112,107,0.06)',
            borderRadius: 4,
            padding: '10px 14px',
            marginBottom: 22,
            fontSize: 13,
            color: 'var(--ink-muted)',
          }}
        >
          {t('machineNote', lang)}
        </div>
      )}

      {story.figure && (
        <div className="figure">
          <img
            src={`./figures/${story.figure}.svg`}
            alt=""
            onError={(e) => {
              ;(e.currentTarget.parentElement as HTMLElement).style.display = 'none'
            }}
          />
          <div className="figure-cap">
            {lang === 'en' ? 'Diagram · desk schematic' : '示意图 · 编辑台绘制'}
          </div>
        </div>
      )}

      <div className="field">
        <div className="field-label">{t('howItWorks', lang)}</div>
        <p>{story.how[lang]}</p>
        {/*
         * Machine records carry no translation. Rather than render an empty
         * field, show the fetched abstract verbatim and say what it is.
         */}
        {story.machine && lang === 'zh' && (
          <>
            <p style={{ fontSize: 13, color: 'var(--ink-faint)', marginTop: 10 }}>
              {t('untranslated', lang)}
            </p>
            <p style={{ color: 'var(--ink-muted)', fontSize: 14 }}>{story.how.en}</p>
          </>
        )}
      </div>

      <div className="field">
        <div className="field-label">{t('whyItMatters', lang)}</div>
        <p>{story.why[lang]}</p>
      </div>

      <div className="field">
        <div className="field-label">{t('whereItApplies', lang)}</div>
        <p>{story.where[lang]}</p>
      </div>

      <div className="field">
        <div className="field-label">
          {t('sources', lang)} · {story.sources.length}
        </div>
        <div className="source-list">
          {sorted.map((s) => (
            <div className="source-item" key={s.url + s.date}>
              <a className="source-name" href={s.url} target="_blank" rel="noopener noreferrer">
                {s.note ? s.note[lang] : s.name}
              </a>
              <span className="chip" data-tone={s.tier === 'primary' ? 'kind' : undefined}>
                {TIER_LABEL[s.tier][lang]}
              </span>
              <span className="source-date">{s.date}</span>
            </div>
          ))}
        </div>
      </div>

      {lag !== null && lag > 0 && canonical && (
        <p style={{ fontSize: 13, color: 'var(--ink-faint)', fontStyle: 'italic' }}>
          {lang === 'en'
            ? `A signal-tier source carried this ${lag} day${lag === 1 ? '' : 's'} before the primary artifact (${canonical.name}, ${canonical.date}) landed.`
            : `线索级来源比原始件（${canonical.name}，${canonical.date}）早 ${lag} 天出现。`}
        </p>
      )}

      <div className="chips" style={{ marginTop: 30 }}>
        {story.tags.map((tg) => (
          <span key={tg} className="chip">{tg}</span>
        ))}
      </div>
    </article>
  )
}
