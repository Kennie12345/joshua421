import type { Reflection } from './reflection'

/**
 * The Log is the growing record of Reflections — the one load-bearing seam.
 *
 * It is, at once:
 *   - the privacy boundary  (behaviour only; no column can hold content),
 *   - the free → premium boundary  (local file today, hosted DB later),
 *   - the test boundary  (flows take a Log, so tests pass a fake).
 */
export interface Log {
  /** Record a reflection. */
  add(reflection: Reflection): Promise<void>

  /** Reflections since an ISO date (inclusive), newest first. Omit for all. */
  reflections(since?: string): Promise<Reflection[]>
}
