/**
 * Rollup periods — the longer horizons the memorial is read at.
 *
 * Over years the Journal's entries become evidence of God's good work; rollups
 * distil them hierarchically (days → week → month → season → year) so a look-back
 * at any horizon reads one level, not a decade of days. Each period has ONE
 * canonical key — the Journal's one-entry-per-period identity (ADR 0005) hangs
 * off it — and one date range, computed here so the assistant never does
 * calendar arithmetic (an LLM's off-by-one week is a memorial quietly misfiled).
 *
 * Pure and deterministic: UTC-midnight arithmetic throughout, so a DST-shortened
 * host day can never skip a date or split a week.
 */
import { shiftDay } from './day'

export type RollupLevel = 'week' | 'month' | 'season' | 'year'

export const ROLLUP_LEVELS = ['week', 'month', 'season', 'year'] as const

const atUtc = (iso: string): Date =>
  new Date(Date.UTC(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)) - 1, Number(iso.slice(8, 10))))

/** ISO-8601 week (Monday-based; week 1 holds the year's first Thursday). A date
 *  in late December or early January can belong to the OTHER year's week — the
 *  returned year is the ISO week-year, not the calendar year. */
function isoWeek(iso: string): { year: number; week: number } {
  const d = atUtc(iso)
  const monBased = (d.getUTCDay() + 6) % 7 // Mon=0 … Sun=6
  d.setUTCDate(d.getUTCDate() - monBased + 3) // the week's Thursday decides the week-year
  const year = d.getUTCFullYear()
  const jan4 = new Date(Date.UTC(year, 0, 4)) // always in week 1
  const jan4MonBased = (jan4.getUTCDay() + 6) % 7
  const week = 1 + Math.round(((d.getTime() - jan4.getTime()) / 86_400_000 - 3 + jan4MonBased) / 7)
  return { year, week }
}

/**
 * The canonical period key for a level and any date inside it — the Journal
 * identity a rollup upserts against. 'YYYY-Www' / 'YYYY-MM' / 'YYYY-Qn' / 'YYYY'.
 */
export function periodFor(level: RollupLevel, iso: string): string {
  switch (level) {
    case 'week': {
      const { year, week } = isoWeek(iso)
      return `${year}-W${String(week).padStart(2, '0')}`
    }
    case 'month':
      return iso.slice(0, 7)
    case 'season':
      return `${iso.slice(0, 4)}-Q${Math.floor((Number(iso.slice(5, 7)) - 1) / 3) + 1}`
    case 'year':
      return iso.slice(0, 4)
  }
}

/** The inclusive ISO-day range a level's period spans around `iso` — what a
 *  look-back at that horizon should gather. */
export function periodRange(level: RollupLevel, iso: string): { since: string; until: string } {
  switch (level) {
    case 'week': {
      const monBased = (atUtc(iso).getUTCDay() + 6) % 7
      const since = shiftDay(iso, -monBased)
      return { since, until: shiftDay(since, 6) }
    }
    case 'month': {
      const since = `${iso.slice(0, 7)}-01`
      const firstOfNext = new Date(Date.UTC(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)), 1))
      return { since, until: shiftDay(firstOfNext.toISOString().slice(0, 10), -1) }
    }
    case 'season': {
      const year = Number(iso.slice(0, 4))
      const q = Math.floor((Number(iso.slice(5, 7)) - 1) / 3) // 0..3
      const since = `${year}-${String(q * 3 + 1).padStart(2, '0')}-01`
      const firstOfNext = new Date(Date.UTC(year, q * 3 + 3, 1))
      return { since, until: shiftDay(firstOfNext.toISOString().slice(0, 10), -1) }
    }
    case 'year':
      return { since: `${iso.slice(0, 4)}-01-01`, until: `${iso.slice(0, 4)}-12-31` }
  }
}

/** The human name a level's rollup entry wears by default — the design's own
 *  language ("your year with God" is the headline artifact). */
export function rollupTitle(level: RollupLevel, period: string): string {
  return `Your ${level} with God · ${period}`
}
