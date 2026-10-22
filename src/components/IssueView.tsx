import type { Dataset, Issue } from '../lib/types'
import { BEAT_LABEL } from '../lib/types'
import type { Lang } from '../lib/i18n'
import { t } from '../lib/i18n'
import { fmtDate } from '../lib/search'
import StoryRow from './StoryRow'

interface Props {
  data: Dataset
  issue: Issue
  lang: Lang
  onOpen: (id: string) => void
  onOpenIssue: (id: string) => void
  allIssues: boolean
}

/**
 * The daily issue — one *view* over the story library, not a separate corpus.
 * Sections are beat projections of the same records the search page shows, so
 * clicking through never leaves the library.
 */
export default function IssueView({ data, issue, lang, onOpen, onOpenIssue, allIssues }: Props) {
  const byId = new Map(data.stories.map((s) => [s.id, s]))

  if (allIssues) {
    return (
      <div style={{ maxWidth: 820 }}>
        <div className="issue-kicker">{t('allIssues', lang)}</div>
        {data.issues.map((iss) => (
          <button
            key={iss.id}
            className="story-row"
            onClick={() => onOpenIssue(iss.id)}
            style={{ display: 'block', width: '100%' }}
          >
            <div className="story-meta">
              <span>{fmtDate(iss.date, lang)}</span>
              <span>·</span>
              <span>{iss.sections.reduce((n, sec) => n + sec.storyIds.length, 0)} {t('storyCount', lang)}</span>
            </div>
            <h3 className="story-title">{iss.headline[lang]}</h3>
            <p className="story-standfirst">{iss.dek[lang]}</p>
          </button>
        ))}
      </div>
    )
  }

  return (
    <div style={{ maxWidth: 880 }}>
      <div className="issue-head">
        <div className="issue-kicker">
          Daily issue · {fmtDate(issue.date, lang)} ·{' '}
          {issue.sections.reduce((n, s) => n + s.storyIds.length, 0)} {t('storyCount', lang)}
        </div>
        <h1>{issue.headline[lang]}</h1>
        <p className="issue-dek">{issue.dek[lang]}</p>
      </div>

      <div className="chips" style={{ marginBottom: 26 }}>
        {issue.tags.map((tg) => (
          <span key={tg} className="chip">{tg}</span>
        ))}
      </div>

      <div className="desk-take">
        <div className="field-label" style={{ marginBottom: 12 }}>{t('deskTake', lang)}</div>
        {issue.deskTake.map((p, i) => (
          <p key={i}>{p[lang]}</p>
        ))}
      </div>

      <div className="signals-block">
        <div className="field-label" style={{ marginBottom: 8 }}>{t('signals', lang)}</div>
        {issue.signals.map((s) => (
          <button key={s.storyId} className="signal-row" onClick={() => onOpen(s.storyId)}>
            <span className="signal-mark">→</span>
            {s.text[lang]}
          </button>
        ))}
      </div>

      {issue.sections.map((sec) => {
        const stories = sec.storyIds.map((id) => byId.get(id)).filter((s): s is NonNullable<typeof s> => !!s)
        if (!stories.length) return null
        return (
          <section key={sec.beat} className="beat-section">
            <div className="beat-heading">
              {BEAT_LABEL[sec.beat][lang]} <span>{stories.length}</span>
            </div>
            <div className="story-list">
              {stories.map((s) => (
                <StoryRow key={s.id} story={s} lang={lang} onOpen={onOpen} />
              ))}
            </div>
          </section>
        )
      })}
    </div>
  )
}
