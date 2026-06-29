/**
 * Grounding — the user's goals / stated intent (what they want God to grow in
 * them). The ONE piece of content joshua421 stores, by the user's explicit
 * choice, so the daily questions and reflections can be grounded in it.
 *
 * Owned by the user, editable or deletable at any time, stored locally — and
 * kept separate from reflection/diary content, which is still never stored
 * (the Log stays behaviour-only).
 */
export interface Grounding {
  /** The saved goals, or null if none set yet. */
  get(): Promise<string | null>
  /** Save (replace) the goals. */
  set(goals: string): Promise<void>
}
