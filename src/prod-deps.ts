import type { Deps } from './core/deps'
import { makeFileGrounding } from './adapters/grounding-file'
import { makeGoogleDiary, makeGoogleMailer } from './adapters/google'
import { makeGoogleJournal } from './adapters/journal-google'
import { makeSqliteLog } from './adapters/log-sqlite'

/** The one production graph: the Diary, Journal, Grounding, Log, mailer and clock. */
export function makeProdDeps(): Deps {
  return {
    mailer: makeGoogleMailer(),
    diary: makeGoogleDiary(),
    grounding: makeFileGrounding(),
    log: makeSqliteLog(),
    journal: makeGoogleJournal(),
    clock: () => new Date(),
  }
}
