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
  const at = (iso: string) =>
    Date.UTC(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)) - 1, Number(iso.slice(8, 10)))
  return Math.round((at(toISO) - at(fromISO)) / 86_400_000)
}
