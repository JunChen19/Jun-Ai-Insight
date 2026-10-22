import type { Lang } from '../lib/i18n'
import { t } from '../lib/i18n'
import { BEAT_LABEL, KIND_LABEL } from '../lib/types'
import type { Story } from '../lib/types'
import { signalLagDays } from '../lib/search'

export function BeatChips({ story, lang, max = 2 }: { story: Story; lang: Lang; max?: number }) {
  return (
    <>
      {story.beats.slice(0, max).map((b) => (
        <span key={b} className="chip" data-tone="beat">
          {BEAT_LABEL[b][lang]}
        </span>
      ))}
    </>
  )
}

export function KindChips({ story, lang, max = 1 }: { story: Story; lang: Lang; max?: number }) {
  return (
    <>
      {story.kinds.slice(0, max).map((k) => (
        <span key={k} className="chip" data-tone="kind">
          {KIND_LABEL[k][lang]}
        </span>
      ))}
    </>
  )
}

/** Shown only when a story actually consolidates more than one origin. */
export function MergeChip({ story, lang }: { story: Story; lang: Lang }) {
  if (story.sources.length < 2) return null
  return (
    <span className="chip" data-tone="merge">
      {story.sources.length} {t('corroborated', lang)}
    </span>
  )
}

/**
 * The number the reference site never surfaces: how many days a newsletter
 * beat the primary artifact to a story. Only rendered when positive.
 */
export function LagBadge({ story, lang }: { story: Story; lang: Lang }) {
  const lag = signalLagDays(story)
  if (lag === null || lag <= 0) return null
  return (
    <span className="lag-badge">
      {lang === 'en' ? `${lag}${t('daysEarlier', lang)}` : `${t('sigLead', lang)} ${lag} ${t('daysEarlier', lang)}`}
    </span>
  )
}

export function SeedChip({ story, lang }: { story: Story; lang: Lang }) {
  if (!story.sample) return null
  return (
    <span className="chip" data-tone="seed">
      {lang === 'en' ? 'SEED' : '种子样本'}
    </span>
  )
}

/** Marks a record whose four fields are placeholders rather than edited copy. */
export function MachineChip({ story, lang }: { story: Story; lang: Lang }) {
  if (!story.machine) return null
  return (
    <span className="chip" data-tone="seed" title={t('machineNote', lang)}>
      {lang === 'en' ? 'UNREVIEWED' : '未复核'}
    </span>
  )
}
