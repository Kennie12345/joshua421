import type { Stone } from './stone'

/**
 * The Cairn is the growing pile of Stones — the one load-bearing seam.
 *
 * It is, at once:
 *   - the privacy boundary  (behaviour only; no column can hold content),
 *   - the free → premium boundary  (local file today, hosted DB later),
 *   - the test boundary  (flows take a Cairn, so tests pass a fake).
 *
 * Everything else in the engine stays concrete until a test makes us promote it.
 */
export interface Cairn {
  /** Lay a stone on the pile. */
  addStone(stone: Stone): Promise<void>

  /** Stones laid since an ISO date (inclusive), newest first. Omit for all. */
  stones(since?: string): Promise<Stone[]>

  /** Current run of consecutive days with at least one 'shown-up' stone. */
  streak(): Promise<number>
}
