import type { Dataset, SourceTier } from '../lib/types'
import { BEAT_LABEL, TIER_LABEL } from '../lib/types'
import type { Lang } from '../lib/i18n'
import { t } from '../lib/i18n'

const TIERS: SourceTier[] = ['primary', 'signal', 'context']

/**
 * The source radar keeps the three tiers visually separate on purpose. Flattening
 * them into one list is how aggregators lose the ability to say "this is a lead,
 * not a citation" — which is the whole editorial claim.
 */
export default function Radar({ data, lang }: { data: Dataset; lang: Lang }) {
  return (
    <div style={{ maxWidth: 1100 }}>
      <div className="radar-intro">{t('radarDesc', lang)}</div>
      {TIERS.map((tier) => {
        const items = data.radar.filter((r) => r.tier === tier)
        if (!items.length) return null
        return (
          <section key={tier} className="radar-section">
            <div className="radar-heading">
              {TIER_LABEL[tier][lang]} · {items.length}
            </div>
            <div className="radar-grid">
              {items.map((r) => (
                <div className="radar-card" key={r.name}>
                  <a href={r.url} target="_blank" rel="noopener noreferrer">
                    {r.name}
                  </a>
                  <p className="radar-desc">{r.desc[lang]}</p>
                  <div className="chips">
                    <span className="chip">
                      {r.cadence === 'daily' ? t('cadenceDaily', lang) : t('cadenceWeekly', lang)}
                    </span>
                    {r.beats.slice(0, 2).map((b) => (
                      <span key={b} className="chip" data-tone="beat">
                        {BEAT_LABEL[b][lang]}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </section>
        )
      })}
    </div>
  )
}
