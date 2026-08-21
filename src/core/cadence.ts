/**
 * Cadence that breathes — decide WHETHER, how gently, and how MUCH to ask, so the
 * rhythm responds to the person instead of nagging on a fixed clock.
 *
 * Three firm choices shape this:
 *  - It is PURE and deterministic — the worker calls no model (provider-agnostic).
 *  - "Unopened" is proxied by SILENCE IN THE LOG (days since the last reflection),
 *    never by tracking whether an email was opened — open-tracking is manipulative
 *    and against "toward God, not the screen".
 *  - PRESENCE HOLDS; THE ASK SCALES. Silence changes the WEIGHT of what the nudge
 *    asks of them, never whether it comes. See ADR 0006 (the secure base). The
 *    earlier design had this backwards — it kept the ask constant and withdrew the
 *    presence, so a person who went quiet for eleven days was dropped to a weekly
 *    email forever, with no way back that didn't require the very reflection the
 *    email was supposed to prompt. A companion that goes quiet when someone drifts
 *    is not being gentle; it is being absent (glossary.md).
 *
 * The worker (launchd) still owns the clock (07:00 / 20:00). Cadence owns which
 * days, which kinds, the tone, and the weight of the ask.
 */
import type { Reflection } from './reflection'
import { isoDay, daysBetween } from './day'

/** How the nudge should open. 'return' = a gentle welcome-back after a gap;
 *  'light' = they already reflected today, so acknowledge it and stay out of the way. */
export type CadenceTone = 'normal' | 'return' | 'light'

/**
 * How much the nudge asks of them — the axis that carries silence.
 *
 *  'full'  the usual two questions
 *  'light' one question, the gentlest in the bank
 *  'none'  no question at all: the day, the door, nothing required of them
 *
 * 'none' is not a lesser email. It is the light left on in the hall — the whole
 * point being that it arrives on time, asks nothing, and needs no reply.
 */
export type AskWeight = 'full' | 'light' | 'none'

/**
 * What this person has SAID helps when they have been away — never what joshua421
 * has deduced about them (ADR 0002: no inferred profile; ADR 0006: the secure base).
 * Named in the `begin` conversation, kept in their grounding, editable by hand.
 *
 *  'steady'    a gap is just a busy week. Normal warmth, unremarkable return.
 *  'reassure'  a gap feels like ground lost. CONSTANCY is the medicine: keep the
 *              full ask, and let the opener carry the non-contingency — nothing
 *              changed, nothing to make up. Shrinking the ask would read as
 *              "it gave up on me", which is the exact wound.
 *  'space'     being asked for reads as a demand. Hold the presence, drop the ask
 *              to nothing: the door stays visibly open and no reply is expected.
 *  'gentle'    both at once — maximum predictability, minimum demand.
 */
export type Orientation = 'steady' | 'reassure' | 'space' | 'gentle'

/** The user's rhythm, parsed from their grounding (or defaults). Days: 0=Sun..6=Sat. */
export interface Cadence {
  morning: boolean
  evening: boolean
  days: 'daily' | ReadonlySet<number>
  churchDay?: number
  /** Absent when they have never said. Never guessed — read as 'steady'. */
  orientation?: Orientation
}

export interface CadenceDecision {
  send: boolean
  tone: CadenceTone
  /** How much to ask of them — the axis silence moves. Meaningless when !send. */
  ask: AskWeight
  /**
   * This send is the thinned weekly touch of a dormant stretch, and the email
   * must SAY so (ADR 0006: a change in presence the person did not ask for is
   * never silent).
   *
   * An explicit flag, not something the caller infers from `reason` — inferring
   * it from `reason === 'dormant-weekly'` silently excluded every user with a
   * church day, because their weekly send comes through the church-day branch
   * and keeps that reason. They thinned from daily to weekly and were never told.
   */
  dormant: boolean
  /** Why — for the worker's log line and for tests. */
  reason: string
}

// Silence thresholds (whole days since the last reflection). Named + tunable.
const GENTLE_AFTER_DAYS = 4 // >= this: a 'return' welcome-back, and the ask starts to yield
const HEAVY_SILENCE_DAYS = 10 // > this: the ask yields as far as their orientation wants
/**
 * > this: dormant. Two months of daily mail with no reflection is not a secure
 * base any more, it is post. So the presence thins to the weekly anchor — but,
 * unlike the old backoff, that send SAYS SO and carries the way back, and one
 * reflection restores the full rhythm immediately (silence resets to 0). Set far
 * enough out that no one who is actually still here can fall through it.
 */
const DORMANT_AFTER_DAYS = 60
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
 * The labelled blocks the induction asks an assistant to write (see INDUCTION in
 * persona.ts). A bare line naming one of these ENDS the preceding section.
 *
 * Grounding docs are written with plain-word headings — "Rhythm", "Church", "Quiet
 * time" — carrying no markdown and no colon. Without this list none of them reads as
 * a boundary, so a heading section runs to the end of the file and swallows every
 * answer below it: a "Rhythm" section absorbs the church day, the quiet-time slot and
 * the goals, and "mornings only" mentioned under Quiet time silently mutes the evening
 * nudge. Matching only KNOWN labels — rather than guessing that any short line is a
 * heading — keeps a bare VALUE ("Weekdays" written under a "Rhythm" heading) from
 * being mistaken for the start of a new block.
 */
const SECTION_LABEL =
  /^\s*(intentions?|goals?|tone|language|rhythm|regularity|cadence|church|quiet[\s-]?time|reading\s+plan|rule|preferences|orientation|coming\s+back|being\s+away)\b[\sa-z&/-]{0,20}$/i

/**
 * Pull the text of a labelled section out of the freeform grounding doc, tolerant
 * of the shapes an assistant actually writes: an inline `Rhythm: weekdays`, or a
 * heading (`Rhythm` / `## Rhythm` / `**Rhythm**`) with the value on the lines below.
 * Scoped to the section so prose elsewhere (a goal that mentions "evening prayer")
 * can't leak into the parse. Returns lowercased text, or null if the label is absent.
 *
 * An inline `Label: value` BEATS a heading section, because the induction asks for
 * both: prose for the human, plus a canonical machine-readable line ("record my rhythm
 * as one of these exact words"). The prose is commentary; the canonical line is the
 * answer. Reading the prose instead is how "Rhythm: mornings only" lost to "A daily
 * nudge, landing in the morning" and shipped evening mail to someone who'd switched it
 * off. Among several inline lines the LAST wins — a later explicit statement overrides
 * an earlier one, and the canonical block is conventionally appended.
 */
function sectionText(doc: string, label: RegExp): string | null {
  const lines = doc.split('\n')
  // A line that begins a NEW labelled block — where the preceding section ends.
  const isBoundary = (line: string) =>
    /^\s*#{1,6}\s+\S/.test(line) || // markdown heading
    /^\s*\*\*[^*]+\*\*/.test(line) || // **bold label**
    /^\s*[A-Za-z][A-Za-z &/]{1,24}\s*:/.test(line) || // Inline Label:
    SECTION_LABEL.test(line) // bare-word heading: "Church"

  let heading: string | null = null // the FIRST heading-only section
  let inline: string | null = null // the LAST `Label: value` — authoritative

  for (let i = 0; i < lines.length; i++) {
    const head = lines[i].match(label)
    if (!head) continue
    const value = lines[i].slice(head.index! + head[0].length).replace(/^[\s:*\-–—]+/, '')
    if (value) {
      inline = value
      continue // keep scanning — a later canonical line overrides this one
    }
    if (heading !== null) continue
    const collected: string[] = []
    for (let j = i + 1; j < lines.length; j++) {
      if (isBoundary(lines[j])) break
      if (lines[j].trim()) collected.push(lines[j])
    }
    heading = collected.join(' ')
  }

  const text = inline ?? heading
  return text === null ? null : text.toLowerCase().trim()
}

/**
 * Parse a Cadence from the grounding doc. Missing/unparseable → sensible default
 * (both kinds, daily), so the feature degrades safe and never silently stops the
 * nudges. The canonical lines an assistant should write are `Rhythm: <daily |
 * weekdays | weekends | weekly | mornings only | evenings only>`, `Church: <day>`,
 * and `Orientation: <steady | reassure | space | gentle>`.
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

  const orientation = parseOrientation(grounding)

  const rhythm = sectionText(grounding, /^\s*#{0,6}\s*\**\s*(rhythm|regularity|cadence)\b/im)
  if (rhythm === null) return { ...DEFAULT_CADENCE, churchDay, ...(orientation ? { orientation } : {}) }

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

  return { morning, evening, days, churchDay, ...(orientation ? { orientation } : {}) }
}

/**
 * Read what they SAID helps on the way back. Scoped to its own section — a goal
 * that happens to say "I need space to think" must never become a standing
 * instruction to ask them nothing. Unrecognised or absent → undefined, read as
 * 'steady'. Never guessed from behaviour (ADR 0002).
 */
function parseOrientation(grounding: string): Orientation | undefined {
  const text = sectionText(grounding, /^\s*#{0,6}\s*\**\s*(orientation|coming\s+back|being\s+away)\b/im)
  if (!text) return undefined
  // Canonical word first; then the plain phrasings a person actually writes.
  if (/\bgentle\b|\bboth\b/.test(text)) return 'gentle'
  if (/\bspace\b|\broom\b|\bno\s+questions?\b|\bleave\s+me\b|\bdon'?t\s+chase\b/.test(text)) return 'space'
  if (/\breassure\b|\bnothing\s+(has\s+)?changed\b|\bas\s+i\s+left\s+(it|them)\b|\bstill\s+there\b/.test(text))
    return 'reassure'
  if (/\bsteady\b|\bnormal\b|\bas\s+usual\b/.test(text)) return 'steady'
  return undefined
}

/**
 * How much to ask of someone who has been away this long, given what they said
 * helps. PURE, and the whole of the silence response — presence itself is never
 * on this table (see decideCadence).
 */
function askWeight(silence: number, orientation: Orientation): AskWeight {
  if (silence < GENTLE_AFTER_DAYS) return 'full'
  const heavy = silence > HEAVY_SILENCE_DAYS
  switch (orientation) {
    // Constancy IS the reassurance. Never thin the ask — that reads as being
    // given up on, which is the precise fear. The opener carries the grace.
    case 'reassure':
      return 'full'
    // Being asked for is the demand. Presence without a single question.
    case 'space':
      return 'none'
    case 'gentle':
      return heavy ? 'none' : 'light'
    case 'steady':
    default:
      return heavy ? 'light' : 'full'
  }
}

/**
 * Decide whether — and how gently, and how much to ask. Ordering matters:
 * kind-off, then already-reflected (soften), then church (never suppress), then
 * dormancy (the one place presence thins, and it says so), then the ordinary
 * schedule with the ask weighted by silence and orientation.
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
  const orientation = cadence.orientation ?? 'steady'

  if (kind === 'morning' && !cadence.morning)
    return { send: false, tone: 'normal', ask: 'full', dormant: false, reason: 'kind-off' }
  if (kind === 'evening' && !cadence.evening)
    return { send: false, tone: 'normal', ask: 'full', dormant: false, reason: 'kind-off' }

  const today = isoDay(now)
  const weekday = now.getDay()

  // Silence: whole days since the most recent reflection. Cold start (never
  // reflected) is a present new user, not deep silence → 0.
  const silence = reflections.length ? daysBetween(reflections[0].date, today) : 0
  const tone: CadenceTone = silence >= GENTLE_AFTER_DAYS ? 'return' : 'normal'
  const dormant = silence > DORMANT_AFTER_DAYS
  // A dormant stretch's single weekly touch asks nothing, whichever branch sends
  // it — the anchor day or the church day.
  const ask = dormant ? 'none' : askWeight(silence, orientation)

  // Already reflected today → soften rather than skip. The Log records every
  // reflection as 'after', so it can't tell a morning reflection from an evening
  // one; a hard skip would cut off the evening look-back for a morning-devotions
  // person. So we still send, lightly, acknowledging they've already shown up.
  if (kind === 'evening' && reflections.some((r) => r.date === today)) {
    return { send: true, tone: 'light', ask: 'light', dormant: false, reason: 'already-reflected' }
  }

  // Church day is never suppressed — the week's highest-leverage reorientation.
  // When the person is also dormant, THIS is the weekly touch, so it carries the
  // dormancy flag: the email says what has changed and how to undo it.
  if (cadence.churchDay === weekday) {
    return { send: true, tone: dormant ? 'return' : tone, ask, dormant, reason: 'church-day' }
  }

  // Dormant: the ONLY place presence thins, and only after two months of daily
  // mail meeting silence. The weekly send names it and carries the way back; a
  // single reflection resets silence to 0 and the full rhythm resumes at once.
  if (dormant) {
    const anchor = cadence.churchDay ?? ANCHOR_DAY
    return weekday === anchor
      ? { send: true, tone: 'return', ask: 'none', dormant: true, reason: 'dormant-weekly' }
      : { send: false, tone: 'return', ask: 'none', dormant: true, reason: 'dormant' }
  }

  const scheduled = cadence.days === 'daily' || cadence.days.has(weekday)
  if (!scheduled) return { send: false, tone, ask, dormant: false, reason: 'off-day' }
  return { send: true, tone, ask, dormant: false, reason: tone === 'return' ? 'gentle-return' : 'normal' }
}
