import type { Story } from '../lib/types'
import type { Lang } from '../lib/i18n'
import { primaryDate } from '../lib/search'
import { BeatChips, KindChips, LagBadge, MachineChip, MergeChip, SeedChip } from './Chips'

interface Props {
  story: Story
  lang: Lang
  onOpen: (id: string) => void
}

/** One row in the results list. Dense, scannable, no card chrome. */
export default function StoryRow({ story, lang, onOpen }: Props) {
  return (
    <button className="story-row" onClick={() => onOpen(story.id)}>
      <div className="story-meta">
        <span>{primaryDate(story)}</span>
        <span>·</span>
        <BeatChips story={story} lang={lang} />
        <KindChips story={story} lang={lang} />
        <MergeChip story={story} lang={lang} />
        <LagBadge story={story} lang={lang} />
        <MachineChip story={story} lang={lang} />
        <SeedChip story={story} lang={lang} />
      </div>
      <h3 className="story-title">{story.title[lang]}</h3>
      {/*
       * Machine records have no translation. Showing the same "not translated"
       * line on every row tells the reader nothing; show the real abstract
       * instead, which at least lets them judge the story.
       */}
      <p className="story-standfirst">
        {story.machine && lang === 'zh' ? story.standfirst.en : story.standfirst[lang]}
      </p>
      <div className="chips">
        {story.tags.slice(0, 5).map((tg) => (
          <span key={tg} className="chip">{tg}</span>
        ))}
      </div>
    </button>
  )
}
