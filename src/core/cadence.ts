/**
 * Cadence that breathes — decide WHETHER (and how gently) to send a daily nudge,
 * so the rhythm responds to the person instead of nagging on a fixed clock.
 *
 * Two firm choices shape this:
 *  - It is PURE and deterministic — the worker calls no model (provider-agnostic).
 *  - "Unopened" is proxied by SILENCE IN THE LOG (days since the last reflection),
 *    never by tracking whether an email was opened — open-tracking is manipulative
 *    and against "toward God, not the screen". The longer the silence, the gentler
 *    and more spacious the welcome back, and the less often we send. Never guiltier.
 *
 * The worker (launchd) still owns the clock (07:00 / 20:00). Cadence owns which
 * days, which kinds, and the tone — the ceiling fires, this decides if we speak.
 */
import type { Reflection } from './reflection'
import { isoDay, daysBetween } from './day'

/** How the nudge should open. 'return' = a gentle welcome-back after a gap;
 *  'light' = they already reflected today, so acknowledge it and stay out of the way. */
export type CadenceTone = 'normal' | 'return' | 'light'

/** The user's rhythm, parsed from their grounding (or defaults). Days: 0=Sun..6=Sat. */
export interface Cadence {
  morning: boolean
  evening: boolean
  days: 'daily' | ReadonlySet<number>
  churchDay?: number
}

export interface CadenceDecision {
  send: boolean
  tone: CadenceTone
  /** Why — for the worker's log line and for tests. */
  reason: string
}

// Silence thresholds (whole days since the last reflection). Named + tunable.
const GENTLE_AFTER_DAYS = 4 // >= this: still send, but with a 'return' welcome-back
const RESTING_AFTER_DAYS = 10 // > this: deep backoff — send at most weekly, on the anchor day
const ANCHOR_DAY = 0 // Sunday — the weekly touch-point when no church day is set

const DAY_NAMES: Record<string, number> = {
  sunday: 0, sun: 0,
  monday: 1, mon: 1,
  tuesday: 2, tue: 2, tues: 2,
  wednesday: 3, wed: 3,
  thursday: 4, thu: 4, thur: 4, thurs: 4,
  friday: 5, fri: 5,
  saturday: 6, sat: 6,
}

const DEFAULT_CADENCE: Cadence = { morning: true, evening: true, days: 'daily' }

/**
 * Pull the text of a labelled section out of the freeform grounding doc, tolerant
 * of the shapes an assistant actually writes: an inline `Rhythm: weekdays`, or a
 * heading (`## Rhythm` / `**Rhythm**`) with the value on the lines below. Scoped to
 * the section so prose elsewhere (a goal that mentions "evening prayer") can't leak
 * into the parse. Returns lowercased text, or null if the label isn't present.
 */
function sectionText(doc: string, label: RegExp): string | null {
  const lines = doc.split('\n')
  // A line that begins a NEW labelled block — where this section ends.
  const isBoundary = (line: string) =>
    /^\s*#{1,6}\s+\S/.test(line) || // markdown heading
    /^\s*\*\*[^*]+\*\*/.test(line) || // **bold label**
    /^\s*[A-Za-z][A-Za-z &/]{1,24}\s*:/.test(line) // Inline Label:
  for (let i = 0; i < lines.length; i++) {
    const head = lines[i].match(label)
    if (!head) continue
    // Value inline after the label on the same line…
    const inline = lines[i].slice(head.index! + head[0].length).replace(/^[\s:*\-–—]+/, '')
    const collected = inline ? [inline] : []
    // …else (heading-only) gather following lines until the next labelled block.
    if (!inline) {
      for (let j = i + 1; j < lines.length; j++) {
        if (isBoundary(lines[j])) break
        if (lines[j].trim()) collected.push(lines[j])
      }
    }
    return collected.join(' ').toLowerCase().trim()
  }
  return null
}

/**
 * Parse a Cadence from the grounding doc. Missing/unparseable → sensible default
 * (both kinds, daily), so the feature degrades safe and never silently stops the
 * nudges. The canonical lines an assistant should write are `Rhythm: <daily |
 * weekdays | weekends | weekly | mornings only | evenings only>` and `Church: <day>`.
 */
export function parseCadence(grounding: string | null): Cadence {
  if (!grounding) return DEFAULT_CADENCE

  // Church day first — a weekly anchor and never suppressed.
  let churchDay: number | undefined
  const church = sectionText(grounding, /^\s*#{0,6}\s*\**\s*church\b/im)
  if (church) {
    for (const [name, n] of Object.entries(DAY_NAMES)) {
      if (new RegExp(`\\b${name}s?\\b`).test(church)) { churchDay = n; break }
    }
  }

  const rhythm = sectionText(grounding, /^\s*#{0,6}\s*\**\s*(rhythm|regularity|cadence)\b/im)
  if (rhythm === null) return { ...DEFAULT_CADENCE, churchDay }

  // Kinds — only from the rhythm section, so goal-prose can't toggle them.
  let morning = true
  let evening = true
  if (/\b(mornings?\s+only|no\s+evenings?|not\s+in\s+the\s+evening)\b/.test(rhythm)) evening = false
  if (/\b(evenings?\s+only|no\s+mornings?|not\s+in\s+the\s+morning)\b/.test(rhythm)) morning = false
  // A contradictory rhythm ("mornings only, evenings only") must not mute everything.
  // There is no "off" in the vocabulary, so both-off is never intent — degrade safe.
  if (!morning && !evening) { morning = true; evening = true }

  // Days.
  let days: Cadence['days'] = 'daily'
  if (/\bweekday/.test(rhythm)) days = new Set([1, 2, 3, 4, 5])
  else if (/\bweekend/.test(rhythm)) days = new Set([0, 6])
  else if (/\bweekly\b/.test(rhythm)) days = new Set([churchDay ?? ANCHOR_DAY])
  // else stays 'daily' (explicit "daily"/"every day", or nothing recognised)

  return { morning, evening, days, churchDay }
}

/**
 * Decide whether — and how gently — to send the `kind` nudge right now. Ordering
 * matters: kind-off, then already-reflected (soften), then church (never suppress),
 * then silence-driven backoff, then the ordinary weekday schedule.
 *
 * `reflections` is the Log, newest first. Cold start (empty log) is treated as a
 * fresh, present user — normal cadence — never as infinite silence.
 */
export function decideCadence(input: {
  kind: 'morning' | 'evening'
  now: Date
  cadence: Cadence
  reflections: Reflection[]
}): CadenceDecision {
  const { kind, now, cadence, reflections } = input

  if (kind === 'morning' && !cadence.morning) return { send: false, tone: 'normal', reason: 'kind-off' }
  if (kind === 'evening' && !cadence.evening) return { send: false, tone: 'normal', reason: 'kind-off' }

  const today = isoDay(now)
  const weekday = now.getDay()

  // Silence: whole days since the most recent reflection. Cold start (never
  // reflected) is a present new user, not deep silence → 0. (Under calendar-as-DB
  // this wants a bounded "most recent" query; the SQLite Log is cheap today.)
  const silence = reflections.length ? daysBetween(reflections[0].date, today) : 0
  const tone: CadenceTone = silence >= GENTLE_AFTER_DAYS ? 'return' : 'normal'

  // Already reflected today → soften rather than skip. The Log records every
  // reflection as 'after', so it can't tell a morning reflection from an evening
  // one; a hard skip would cut off the evening look-back for a morning-devotions
  // person. So we still send, lightly, acknowledging they've already shown up.
  if (kind === 'evening' && reflections.some((r) => r.date === today)) {
    return { send: true, tone: 'light', reason: 'already-reflected' }
  }

  // Church day is never suppressed — the week's highest-leverage reorientation.
  if (cadence.churchDay === weekday) return { send: true, tone, reason: 'church-day' }

  // Deep backoff: after a long silence, fall to at most weekly (the anchor/church
  // day), gently. Every other day rests. Kills the "unopened guilt pile".
  if (silence > RESTING_AFTER_DAYS) {
    const anchor = cadence.churchDay ?? ANCHOR_DAY
    return weekday === anchor
      ? { send: true, tone: 'return', reason: 'weekly-return' }
      : { send: false, tone: 'return', reason: 'resting' }
  }

  const scheduled = cadence.days === 'daily' || cadence.days.has(weekday)
  if (!scheduled) return { send: false, tone, reason: 'off-day' }
  return { send: true, tone, reason: tone === 'return' ? 'gentle-return' : 'normal' }
}
