import type { Journal } from '../core/journal'
import type { Log } from '../core/log'
import type { Reflection } from '../core/reflection'
import { marker } from '../core/journal'

/**
 * The Log, stored in the user's own calendar — the calendar-as-database cutover
 * (design: "we store nothing at all"). A reflected day becomes one empty-body
 * Marker entry in the Journal; the no-content promise stays STRUCTURAL, because
 * `marker()` takes only the day and cannot carry words.
 *
 * What the Marker deliberately does not hold (ADR 0005): kind and sub-day
 * granularity. Two reflections on one day are one Marker; a read maps back to
 * one canonical shown-up Reflection per day. That is aligned, not lossy-by-
 * accident — silence is counted in days, the memorial is read in days, and the
 * cadence engine cannot (and should not) tell a morning reflection from an
 * evening one.
 */
export function makeJournalLog(journal: Journal): Log {
  return {
    async add(reflection: Reflection): Promise<void> {
      // Markers mean "they reflected". A 'skipped' record is nothing to
      // memorialise — writing it would put an absence on their calendar.
      if (reflection.status !== 'shown-up') return
      await journal.upsert('reflection', reflection.date, marker(reflection.date))
    },

    async reflections(since?: string): Promise<Reflection[]> {
      const entries = await journal.query({ kind: 'reflection', ...(since ? { since } : {}) })
      // Newest first (the Journal's order). Kind/status are the canonical
      // per-day values — the Marker holds only the day, by design.
      return entries.map((e) => ({
        id: e.id,
        date: e.date,
        kind: 'after' as const,
        status: 'shown-up' as const,
      }))
    },
  }
}
