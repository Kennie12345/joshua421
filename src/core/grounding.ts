/**
 * Grounding — the user's preferences / stated intent: goals (what they want God
 * to grow in them), the tone and language they want, their weekly rhythm, church
 * day/time, and any quiet-time slot. The ONE piece of content joshua421 stores,
 * by the user's explicit choice, so the daily questions and reflections can be
 * grounded in it.
 *
 * Held as one freeform plain-text document (suggested headings, not a rigid
 * schema) — the reflector reads the whole thing as context, so new preferences
 * slot in without code changes. Owned by the user, editable or deletable at any
 * time, stored locally — and kept separate from reflection/diary content, which
 * is still never stored (the Log stays behaviour-only).
 *
 * Stored as a local file for now; migrates to a calendar entry at the Journal
 * cutover (storage moves to the calendar, this port stays the same).
 */
export interface Grounding {
  /** The saved preferences, or null if none set yet. */
  get(): Promise<string | null>
  /** Save (replace) the preferences document. */
  set(preferences: string): Promise<void>
}
