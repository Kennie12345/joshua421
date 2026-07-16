import type { Deps } from './core/deps'
import { makeGoogleDiary, makeGoogleMailer } from './adapters/google'
import { makeGoogleJournal } from './adapters/journal-google'
import { makeJournalGrounding } from './adapters/grounding-journal'
import { makeJournalLog } from './adapters/log-journal'

/**
 * The one production graph. Since the calendar-as-database cutover, the Log and
 * the Grounding are USES of the one Journal seam — everything joshua421 keeps
 * (Markers, day summaries, rollups, preferences) lives in the user's own
 * calendar, and nothing lives on our side. `npm run migrate` moves a
 * pre-cutover machine's SQLite log and grounding file across, once.
 */
export function makeProdDeps(): Deps {
  const journal = makeGoogleJournal()
  return {
    mailer: makeGoogleMailer(),
    diary: makeGoogleDiary(),
    grounding: makeJournalGrounding(journal),
    log: makeJournalLog(journal),
    journal,
    clock: () => new Date(),
  }
}
