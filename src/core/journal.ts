/**
 * The Journal is joshua421's store — the user's own calendar used as a database.
 *
 * Entries are typed and tagged; nothing lives on our side. The behavioural log,
 * the day summaries, the long-horizon rollups, and the preferences are all just
 * typed entries here — so `Log`, `Preferences`, rollups, and significant-moments
 * become *uses of* this one seam rather than separate stores.
 *
 * Backed by the calendar today; the engine never learns that. A SQLite/in-memory
 * Journal stays a valid adapter for tests.
 */
export type JournalKind =
  | 'reflection' // behavioural record: the user reflected on a day
  | 'day-summary' // the evening summary — the diary entry for a day
  | 'rollup' // a weekly / monthly / seasonal / yearly distillation
  | 'preferences' // the user's goals / orientation

export interface JournalEntry {
  id: string
  kind: JournalKind
  /** The identity key for this Journal entry — a day or a rollup period. */
  period: string
  /** The day (or anchor day) this entry belongs to — YYYY-MM-DD. */
  date: string
  title: string
  body: string
  /** Queryable metadata, e.g. { level: 'weekly', significant: 'true' }. */
  tags?: Record<string, string>
}

export interface JournalQuery {
  kind?: JournalKind
  period?: string
  /** Inclusive YYYY-MM-DD bounds. */
  since?: string
  until?: string
  /** All must match (ANDed). */
  tags?: Record<string, string>
}

export interface Journal {
  /** Write or replace the Journal entry for this kind and period. */
  upsert(
    kind: JournalKind,
    periodKey: string,
    entry: { date: string; title: string; body: string; tags?: Record<string, string> },
  ): Promise<JournalEntry>
  /** Read entries by kind / date range / tags. Newest first. */
  query(q?: JournalQuery): Promise<JournalEntry[]>
  /** Delete an entry (the Journal only ever holds its own entries). */
  delete(id: string): Promise<void>
}

/** The Marker for a reflected day. Takes only the day — it CANNOT carry content. */
export const marker = (date: string): { date: string; title: string; body: '' } =>
  ({ date, title: 'Reflected', body: '' })
