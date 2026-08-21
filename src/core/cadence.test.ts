import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseCadence, decideCadence } from './cadence'
import type { Reflection } from './reflection'

const refl = (date: string): Reflection => ({ id: date, date, kind: 'after', status: 'shown-up' })

// July 2026: 01=Wed, 04=Sat, 05=Sun, 06=Mon, 12=Sun, 15=Wed. (Used below.)
const WED = new Date('2026-07-15T20:00:00')
const SAT = new Date('2026-07-04T20:00:00')
const SUN = new Date('2026-07-12T09:00:00')

test('weekday map sanity — the fixtures rest on these', () => {
  assert.equal(WED.getDay(), 3, 'sanity: 2026-07-15 is a Wednesday')
  assert.equal(SAT.getDay(), 6, 'sanity: 2026-07-04 is a Saturday')
  assert.equal(SUN.getDay(), 0, 'sanity: 2026-07-12 is a Sunday')
})

// ── parseCadence ─────────────────────────────────────────────────────────────

test('parseCadence: no grounding → both kinds, daily (degrade safe, never silence the nudge)', () => {
  const c = parseCadence(null)
  assert.deepEqual({ morning: c.morning, evening: c.evening, days: c.days }, { morning: true, evening: true, days: 'daily' })
  assert.equal(c.churchDay, undefined)
  assert.equal(c.orientation, undefined, 'never guessed — absent means absent')
})

test('parseCadence: canonical inline lines an assistant should write', () => {
  const c = parseCadence('## Goals\nGrow in patience.\n\nRhythm: weekdays\nChurch: Sunday\nOrientation: reassure')
  assert.deepEqual([...(c.days as Set<number>)].sort(), [1, 2, 3, 4, 5])
  assert.equal(c.churchDay, 0)
  assert.equal(c.orientation, 'reassure')
  assert.ok(c.morning && c.evening)
})

test('parseCadence: markdown heading + prose (no canonical line) still parses', () => {
  const doc = '## Rhythm\nWeekday mornings mostly; evenings when I can.\n\n## Church\nWe go to church on Sundays at 10.'
  const c = parseCadence(doc)
  assert.deepEqual([...(c.days as Set<number>)].sort(), [1, 2, 3, 4, 5], 'weekday rhythm')
  assert.equal(c.churchDay, 0, 'church on Sundays')
  assert.ok(c.morning && c.evening, 'mentions both mornings and evenings → both on')
})

test('parseCadence: a real toggle phrase in Goals does NOT leak into kinds (scoped to the rhythm section)', () => {
  const c = parseCadence('Goals: no mornings without prayer, and grow in evening prayer\nRhythm: daily\nChurch: sunday')
  assert.ok(c.morning && c.evening, 'a "no mornings" goal must not switch the morning kind off')
  assert.equal(c.days, 'daily')
  assert.equal(c.churchDay, 0)
})

test('parseCadence: a contradictory rhythm degrades safe — never silences every nudge', () => {
  const c = parseCadence('Rhythm: mornings only, evenings only')
  assert.ok(c.morning || c.evening, 'both-off is never intent (no "off" in the vocabulary) — keep at least one on')
})

test('parseCadence: "evenings only" turns mornings off; "weekly" anchors to the church day', () => {
  const only = parseCadence('Rhythm: evenings only, weekdays')
  assert.equal(only.morning, false)
  assert.equal(only.evening, true)

  const weekly = parseCadence('Rhythm: weekly\nChurch: Wednesday')
  assert.deepEqual([...(weekly.days as Set<number>)], [3], 'weekly falls on the church day')
  assert.equal(weekly.churchDay, 3)
})

// ── parseOrientation (via parseCadence) ──────────────────────────────────────

test('parseOrientation: every canonical word round-trips', () => {
  for (const word of ['steady', 'reassure', 'space', 'gentle'] as const) {
    assert.equal(parseCadence(`Orientation: ${word}`).orientation, word, word)
  }
})

test('parseOrientation: the plain phrasings a person actually writes', () => {
  const cases: [string, string][] = [
    ['Coming back: I want plenty of room and no questions', 'space'],
    ['Coming back: it helps to find things as I left them', 'reassure'],
    ['Being away: nothing has changed, tell me that', 'reassure'],
    ['Orientation: just normal, a gap is a gap', 'steady'],
    ['Coming back: honestly both — gentle', 'gentle'],
  ]
  for (const [doc, want] of cases) {
    assert.equal(parseCadence(doc).orientation, want, doc)
  }
})

test('parseOrientation: a GOAL mentioning space must not become a standing instruction to ask nothing', () => {
  // The scoping guard, made able to fail: "space" appears, but under Goals.
  const c = parseCadence('Goals: I need space to think and hear God\nRhythm: daily')
  assert.equal(c.orientation, undefined, 'orientation is read only from its own section')
})

test('parseOrientation: an unrecognised answer is left absent, never guessed', () => {
  assert.equal(parseCadence('Orientation: not sure really').orientation, undefined)
})

// ── decideCadence — presence ─────────────────────────────────────────────────

const DEFAULT = parseCadence(null)

test('decide: cold start (empty log) is a present new user — normal send, not deep silence', () => {
  const d = decideCadence({ kind: 'morning', now: WED, cadence: DEFAULT, reflections: [] })
  assert.deepEqual([d.send, d.tone, d.ask], [true, 'normal', 'full'])
})

test('decide: a kind the user turned off is never sent', () => {
  const cadence = parseCadence('Rhythm: evenings only')
  assert.equal(decideCadence({ kind: 'morning', now: WED, cadence, reflections: [] }).send, false)
  assert.equal(decideCadence({ kind: 'evening', now: WED, cadence, reflections: [] }).send, true)
})

test('decide: weekdays-only rests on the weekend, sends on a weekday', () => {
  const cadence = parseCadence('Rhythm: weekdays')
  assert.equal(decideCadence({ kind: 'morning', now: SAT, cadence, reflections: [] }).reason, 'off-day')
  assert.equal(decideCadence({ kind: 'morning', now: WED, cadence, reflections: [] }).send, true)
})

test('decide: already reflected today → soften the evening, do not skip it', () => {
  const d = decideCadence({ kind: 'evening', now: WED, cadence: DEFAULT, reflections: [refl('2026-07-15')] })
  assert.deepEqual([d.send, d.tone, d.reason], [true, 'light', 'already-reflected'])
})

test('decide: a short gap (5 days) still sends, with a gentle welcome-back tone', () => {
  const d = decideCadence({ kind: 'morning', now: WED, cadence: DEFAULT, reflections: [refl('2026-07-10')] })
  assert.deepEqual([d.send, d.tone], [true, 'return'])
})

/**
 * THE REGRESSION THIS FILE EXISTS FOR.
 *
 * The previous design dropped to a weekly email after 11 days of silence, and the
 * only exit was a reflection — which needed the email that was no longer coming.
 * Five weeks of real dogfood produced 74 jobs and 4 emails. Presence must never be
 * what silence takes away.
 */
test('decide: eleven days of silence still sends at the stated rhythm — the spiral is closed', () => {
  const d = decideCadence({ kind: 'morning', now: WED, cadence: DEFAULT, reflections: [refl('2026-07-04')] })
  assert.equal(d.send, true, '11 days must still send — withdrawing presence is what caused the spiral')
  assert.equal(d.tone, 'return', 'gentler, yes')
  assert.notEqual(d.reason, 'resting')
})

test('decide: a month of silence still sends daily — only the ask has thinned', () => {
  const d = decideCadence({ kind: 'morning', now: WED, cadence: DEFAULT, reflections: [refl('2026-06-15')] })
  assert.equal(d.send, true, '30 days: still present')
  assert.equal(d.ask, 'light', 'steady orientation yields the ask, never the presence')
})

test('decide: an explicit daily rhythm is honoured through heavy silence', () => {
  const cadence = parseCadence('Rhythm: daily')
  for (const last of ['2026-07-04', '2026-06-20', '2026-06-01']) {
    const d = decideCadence({ kind: 'morning', now: WED, cadence, reflections: [refl(last)] })
    assert.equal(d.send, true, `asked for daily, silent since ${last} → still daily`)
  }
})

// ── decideCadence — the ask, per orientation ─────────────────────────────────

const at = (orientation: string, last: string, now = WED) =>
  decideCadence({
    kind: 'morning',
    now,
    cadence: parseCadence(`Rhythm: daily\nOrientation: ${orientation}`),
    reflections: [refl(last)],
  })

test('ask: under 4 days nobody is treated as away', () => {
  for (const o of ['steady', 'reassure', 'space', 'gentle']) {
    assert.equal(at(o, '2026-07-13').ask, 'full', `${o} at 2 days`)
  }
})

test('ask: reassure keeps the FULL ask at every depth — constancy is the medicine', () => {
  // Thinning the ask is what reads as "it gave up on me" — the precise wound.
  assert.equal(at('reassure', '2026-07-08').ask, 'full', '7 days')
  assert.equal(at('reassure', '2026-07-01').ask, 'full', '14 days')
  assert.equal(at('reassure', '2026-06-01').ask, 'full', '44 days')
})

test('ask: space drops to nothing as soon as they are away, and stays present', () => {
  const d = at('space', '2026-07-08')
  assert.deepEqual([d.send, d.ask], [true, 'none'], 'the door stays open; nothing is asked of them')
  assert.equal(at('space', '2026-06-01').ask, 'none', 'and still nothing at 44 days')
})

test('ask: gentle yields by degrees — light first, then nothing', () => {
  assert.equal(at('gentle', '2026-07-08').ask, 'light', '7 days')
  assert.equal(at('gentle', '2026-07-01').ask, 'none', '14 days')
})

test('ask: steady holds the full ask through a short gap, thins after heavy silence', () => {
  assert.equal(at('steady', '2026-07-08').ask, 'full', '7 days')
  assert.equal(at('steady', '2026-07-01').ask, 'light', '14 days')
})

test('ask: an unset orientation behaves exactly as steady — never guessed', () => {
  const unset = decideCadence({ kind: 'morning', now: WED, cadence: parseCadence('Rhythm: daily'), reflections: [refl('2026-07-01')] })
  assert.equal(unset.ask, at('steady', '2026-07-01').ask)
})

// ── decideCadence — church and dormancy ──────────────────────────────────────

test('decide: the church day is never suppressed — even in deep silence, even off the weekday schedule', () => {
  const cadence = parseCadence('Rhythm: weekdays\nChurch: Sunday') // Sunday NOT in weekdays
  const d = decideCadence({ kind: 'morning', now: SUN, cadence, reflections: [refl('2026-06-01')] })
  assert.deepEqual([d.send, d.reason], [true, 'church-day'])
})

test('decide: dormancy is the ONLY place presence thins — and not before 60 days', () => {
  // 2026-07-15 minus 60 days = 2026-05-16. At exactly 60, still the full rhythm.
  const at60 = decideCadence({ kind: 'morning', now: WED, cadence: DEFAULT, reflections: [refl('2026-05-16')] })
  assert.equal(at60.send, true, '60 days: still present daily')
  const at61 = decideCadence({ kind: 'morning', now: WED, cadence: DEFAULT, reflections: [refl('2026-05-15')] })
  assert.deepEqual([at61.send, at61.reason], [false, 'dormant'], '61 days on an ordinary day: dormant')
})

test('decide: a dormant person still gets the weekly anchor, and it asks nothing', () => {
  const d = decideCadence({ kind: 'morning', now: SUN, cadence: DEFAULT, reflections: [refl('2026-04-01')] })
  assert.deepEqual([d.send, d.tone, d.ask, d.reason], [true, 'return', 'none', 'dormant-weekly'])
})

test('decide: one reflection restores the full rhythm immediately — dormancy is never a trap', () => {
  const cadence = parseCadence('Rhythm: daily')
  const dormant = decideCadence({ kind: 'morning', now: WED, cadence, reflections: [refl('2026-04-01')] })
  assert.equal(dormant.send, false, 'precondition: dormant')
  // They reflect once. Silence resets to 0 — nothing else has to happen.
  const after = decideCadence({ kind: 'morning', now: WED, cadence, reflections: [refl('2026-07-15'), refl('2026-04-01')] })
  assert.deepEqual([after.send, after.tone, after.ask], [true, 'normal', 'full'], 'straight back to full presence')
})

/**
 * The hole ADR 0006 left open on its first pass. `flows.ts` used to infer "this
 * is the dormant weekly touch" from `reason === 'dormant-weekly'` — but a person
 * with a church day gets their weekly touch through the CHURCH-DAY branch, which
 * keeps its own reason. They thinned from daily to weekly and were never told,
 * which is the one thing the ADR promises never happens.
 */
test('decide: a dormant person WITH a church day is told, on their church day', () => {
  const cadence = parseCadence('Rhythm: daily\nChurch: Sunday')
  const away = [refl('2026-04-01')] // ~100 days by mid-July

  const churchDay = decideCadence({ kind: 'morning', now: SUN, cadence, reflections: away })
  assert.equal(churchDay.send, true, 'the church day is never suppressed')
  assert.equal(churchDay.dormant, true, 'and it must carry the dormancy, or the email stays silent about it')
  assert.equal(churchDay.ask, 'none', 'asking nothing of someone this far away')
  assert.equal(churchDay.tone, 'return')

  const ordinary = decideCadence({ kind: 'morning', now: WED, cadence, reflections: away })
  assert.deepEqual([ordinary.send, ordinary.dormant], [false, true], 'ordinary days rest, and know why')
})

test('decide: dormant is false for everyone who is not dormant', () => {
  const cadence = parseCadence('Rhythm: daily\nChurch: Sunday')
  for (const [label, last, now] of [
    ['present', '2026-07-14', WED],
    ['a week away', '2026-07-08', WED],
    ['a month away', '2026-06-15', WED],
    ['on their church day', '2026-07-10', SUN],
  ] as const) {
    assert.equal(
      decideCadence({ kind: 'morning', now, cadence, reflections: [refl(last)] }).dormant,
      false,
      label,
    )
  }
})
