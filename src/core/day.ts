/**
 * Local-day helpers, shared by the flows and the cadence engine (kept here so
 * neither has to import the other). A "day" is an ISO local date, YYYY-MM-DD.
 */

/** ISO local day (YYYY-MM-DD) for a Date — local calendar fields, so the record
 *  date, the look-back window, and any streak walk all agree on the user's day. */
export function isoDay(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/** Whole days from one ISO day to another (`to - from`); positive if `to` is
 *  later. Parsed as UTC midnights so it never drifts with the host zone or DST. */
export function daysBetween(fromISO: string, toISO: string): number {
  return Math.round((atUtcMidnight(toISO) - atUtcMidnight(fromISO)) / 86_400_000)
}

/** The ISO day `delta` whole days from `iso` (negative for earlier). UTC-midnight
 *  arithmetic, so a DST-shortened local day can never skip or repeat a date. */
export function shiftDay(iso: string, delta: number): string {
  return new Date(atUtcMidnight(iso) + delta * 86_400_000).toISOString().slice(0, 10)
}

const atUtcMidnight = (iso: string): number =>
  Date.UTC(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)) - 1, Number(iso.slice(8, 10)))
