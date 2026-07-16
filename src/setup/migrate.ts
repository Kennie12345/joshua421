import '../env'
import { pathToFileURL } from 'node:url'
import { existsSync } from 'node:fs'
import type { Grounding } from '../core/grounding'
import type { Journal } from '../core/journal'
import type { Log } from '../core/log'
import { marker } from '../core/journal'
import { isoDay } from '../core/day'
import { makeFileGrounding } from '../adapters/grounding-file'
import { makeGoogleJournal } from '../adapters/journal-google'
import { makeJournalGrounding, PREFERENCES_PERIOD } from '../adapters/grounding-journal'
import { makeSqliteLog } from '../adapters/log-sqlite'

/**
 * `npm run migrate` — the one-time cutover of the pre-Journal local stores into
 * the user's calendar: every shown-up day in the SQLite log becomes an
 * empty-body Marker entry, and the grounding file becomes the one preferences
 * entry. After it, joshua421 stores nothing at all on this machine.
 *
 * Safe to re-run: Markers upsert against their day (the Journal's
 * one-per-period identity), and the preferences migrate ONLY when the Journal
 * has none yet — a stale file must never clobber preferences the user has since
 * saved through the conversation. The legacy files are left in place as the
 * user's own backup; deleting them is their call, once they trust the calendar.
 */
export async function migrateToJournal(
  legacy: { log?: Log; grounding?: Grounding },
  journal: Journal,
): Promise<{ markerDays: number; grounding: 'migrated' | 'kept-journal' | 'none' }> {
  let markerDays = 0
  if (legacy.log) {
    const days = [
      ...new Set(
        (await legacy.log.reflections()).filter((r) => r.status === 'shown-up').map((r) => r.date),
      ),
    ].sort()
    for (const date of days) await journal.upsert('reflection', date, marker(date))
    markerDays = days.length
  }

  let grounding: 'migrated' | 'kept-journal' | 'none' = 'none'
  const text = (await legacy.grounding?.get()) ?? null
  if (text) {
    const [existing] = await journal.query({ kind: 'preferences', period: PREFERENCES_PERIOD })
    if (existing?.body.trim()) {
      grounding = 'kept-journal' // the calendar's copy is the living one
    } else {
      await makeJournalGrounding(journal).set(text)
      grounding = 'migrated'
    }
  }

  return { markerDays, grounding }
}

/** The CLI run against the real legacy files and the real calendar Journal. */
export async function runMigration(log = console.log): Promise<void> {
  const dbPath = process.env.JOSHUA421_DB ?? ''
  const groundingPath = process.env.GROUNDING_PATH ?? ''
  const hasDb = existsSync(dbPath)
  const hasGrounding = existsSync(groundingPath)
  if (!hasDb && !hasGrounding) {
    log('nothing to migrate — no legacy log or grounding file found. All clear.')
    return
  }

  const result = await migrateToJournal(
    {
      ...(hasDb ? { log: makeSqliteLog(dbPath) } : {}),
      ...(hasGrounding ? { grounding: makeFileGrounding(groundingPath) } : {}),
    },
    makeGoogleJournal(),
  )

  if (hasDb) log(`  ✓ ${result.markerDays} reflected day(s) now stand as Markers in your calendar`)
  if (result.grounding === 'migrated') log('  ✓ preferences moved into your calendar (one entry, yours to edit)')
  if (result.grounding === 'kept-journal')
    log('  · your calendar already holds preferences — the local file was NOT copied over it')
  log('')
  log(`Done (${isoDay(new Date())}). The local files were left in place as your own backup:`)
  if (hasDb) log(`  ${dbPath}`)
  if (hasGrounding) log(`  ${groundingPath}`)
  log('Delete them whenever you trust the calendar. Re-running is safe.')
}

const isEntry = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href
if (isEntry) {
  runMigration().catch((err) => {
    console.error(err)
    process.exit(1)
  })
}
