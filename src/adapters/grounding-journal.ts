import type { Grounding } from '../core/grounding'
import type { Journal } from '../core/journal'
import { isoDay } from '../core/day'

/** The Journal identity of the ONE preferences entry (kind + period, ADR 0005). */
export const PREFERENCES_PERIOD = 'preferences'

/**
 * Grounding, stored in the user's own calendar — one dedicated Journal entry
 * (kind 'preferences') instead of a local file. Still the one piece of content
 * joshua421 keeps, by the user's explicit choice; still theirs to edit by hand —
 * the entry's description IS the document, and a hand-edit in Google Calendar
 * reads back exactly like a set_grounding save. The entry's date moves to the
 * day it was last saved, so the calendar shows when the preferences last turned.
 */
export function makeJournalGrounding(journal: Journal, clock: () => Date = () => new Date()): Grounding {
  return {
    async get(): Promise<string | null> {
      const [entry] = await journal.query({ kind: 'preferences', period: PREFERENCES_PERIOD })
      const text = entry?.body.trim()
      return text ? text : null
    },

    async set(preferences: string): Promise<void> {
      await journal.upsert('preferences', PREFERENCES_PERIOD, {
        date: isoDay(clock()),
        title: 'joshua421 · your preferences',
        body: preferences.trim(),
      })
    },
  }
}
