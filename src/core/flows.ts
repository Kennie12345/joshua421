import { randomUUID } from 'node:crypto'
import type { Deps, DayEvent } from './deps'
import type { Reflection } from './reflection'
import { companionFrame, dayQuestions, INDUCTION } from './persona'
import { isoDay, shiftDay } from './day'
import { parseCadence, decideCadence, type CadenceTone } from './cadence'
import { periodFor, periodRange, rollupTitle, type RollupLevel } from './rollup'

/**
 * Read the day's calendar entries for reflection, plus yesterday's kept summary
 * (their own words — the thread the day continues). The conversation with Claude
 * does the reflecting — this just hands it the canvas.
 */
export async function readDay(
  date: string,
  deps: Deps,
): Promise<{ events: DayEvent[]; yesterdaySummary?: string }> {
  const [events, yesterday] = await Promise.all([
    deps.diary.day(date),
    yesterdaySummary(date, deps),
  ])
  return { events, ...(yesterday ? { yesterdaySummary: yesterday } : {}) }
}

/** The day-summary the user kept for the day before `date`, or null. Read live
 *  from the Journal (their calendar) — never from a store of ours. */
async function yesterdaySummary(date: string, deps: Deps): Promise<string | null> {
  const day = shiftDay(date, -1)
  const [entry] = await deps.journal.query({ kind: 'day-summary', period: day, since: day, until: day })
  return entry?.body || null
}

/**
 * Apply the user-APPROVED notes plus an optional day summary, and record that
 * they reflected. Each note chooses its write mode (`placement`): into the
 * event's own notes (additive, the default), or a private side-entry in the same
 * time slot — the only mode for shared/public events, whose descriptions sync to
 * other people. The summary belongs to the Journal; the Log keeps behaviour only.
 */
export async function applyDayNotes(
  input: {
    date: string
    notes: { eventId: string; note: string; placement?: 'note' | 'side' }[]
    summary?: string
  },
  deps: Deps,
): Promise<Reflection> {
  for (const n of input.notes) {
    if (n.placement === 'side') await deps.diary.sideEntry(n.eventId, n.note)
    else await deps.diary.annotate(n.eventId, n.note)
  }
  if (input.summary) {
    await deps.journal.upsert('day-summary', input.date, {
      date: input.date,
      title: `Reflection · ${input.date}`,
      body: input.summary,
    })
  }
  const reflection: Reflection = {
    id: randomUUID(),
    date: input.date,
    kind: 'after',
    status: 'shown-up',
  }
  await deps.log.add(reflection)
  return reflection
}

/**
 * Reverse a joshua421 write, at the user's request — the delete of the diary's
 * CRUD, kept as narrow as the promise demands. 'strip_note' removes only our
 * fenced block from THEIR event (their words survive, even ones added after our
 * block; ambiguity is a no-op). 'delete_entry' removes an entry joshua421
 * CREATED — a side entry, a day summary, a rollup — via the Journal's guarded
 * delete, which refuses anything untagged: their real events are structurally
 * out of reach.
 */
export async function undoWrite(
  input: { eventId: string; action: 'strip_note' | 'delete_entry' },
  deps: Deps,
): Promise<void> {
  if (input.action === 'strip_note') await deps.diary.stripAnnotation(input.eventId)
  else await deps.journal.delete(input.eventId)
}

/**
 * Gather the raw material for a look-back — the memorial's read side. Returns
 * the days they showed up, the day-summaries they kept (their OWN words), and
 * any rollups already written over the range — all read live from the Journal
 * and the Log, never from a store of ours. The WEAVING happens in the
 * conversation: joshua421 hands over stones, the assistant helps them hear
 * "look how faithful God has been". Summaries come back oldest-first, so the
 * range reads as a story, not a feed.
 *
 * Give either an explicit `{since, until}`, or a `{level, date}` and the range
 * is the period around that date (deterministic — the assistant never does
 * calendar arithmetic). No range at all means this week.
 */
export async function lookBack(
  input: { since?: string; until?: string; level?: RollupLevel; date?: string },
  deps: Deps,
): Promise<{
  since: string
  until: string
  reflectedDays: string[]
  summaries: { date: string; body: string }[]
  rollups: { period: string; level?: string; title: string; body: string }[]
}> {
  const { since, until } =
    input.since && input.until
      ? { since: input.since, until: input.until }
      : periodRange(input.level ?? 'week', input.date ?? isoDay(deps.clock()))

  const [reflections, summaries, rollups] = await Promise.all([
    deps.log.reflections(since),
    deps.journal.query({ kind: 'day-summary', since, until }),
    deps.journal.query({ kind: 'rollup', since, until }),
  ])
  const reflectedDays = [
    ...new Set(reflections.filter((r) => r.date <= until && r.status === 'shown-up').map((r) => r.date)),
  ].sort()

  return {
    since,
    until,
    reflectedDays,
    summaries: summaries.map((e) => ({ date: e.date, body: e.body })).reverse(),
    rollups: rollups.map((e) => ({
      period: e.period,
      ...(e.tags?.level ? { level: e.tags.level } : {}),
      title: e.title,
      body: e.body,
    })),
  }
}

/**
 * Keep an APPROVED look-back distillation as the period's own Journal entry —
 * the memorial's write side. One rollup per period (the Journal's upsert
 * identity), so re-visiting a week replaces its stone rather than piling a
 * second. Records that a look-back happened (behaviour only — the Log never
 * sees the words).
 */
export async function saveRollup(
  input: { level: RollupLevel; date: string; body: string; title?: string },
  deps: Deps,
): Promise<{ period: string }> {
  const period = periodFor(input.level, input.date)
  await deps.journal.upsert('rollup', period, {
    date: input.date,
    title: input.title ?? rollupTitle(input.level, period),
    body: input.body,
    tags: { level: input.level },
  })
  await deps.log.add({
    id: randomUUID(),
    date: input.date,
    kind: 'look-back',
    status: 'shown-up',
  })
  return { period }
}

/**
 * A short clock label (e.g. "09:30") for an event — as the user's CALENDAR
 * renders it. startLocal is the calendar's wall-clock string
 * ("2026-07-02T23:00:00+10:00"), so the label is sliced straight out of it;
 * formatting the Date instead would localize to wherever the worker happens to
 * run, and a Sydney 23:00 event would read "13:00" the day this moves to a UTC
 * box. A bare-date startLocal is an all-day entry — no clock to print.
 */
function eventClock(e: DayEvent): string {
  if (e.startLocal) {
    return e.startLocal.length >= 16 ? e.startLocal.slice(11, 16) : 'all day'
  }
  return e.start.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

/** Escape text for safe interpolation into HTML (event titles etc. are user data). */
function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/** Text → HTML block: escape, then turn newlines into <br>. */
function htmlLines(s: string): string {
  return escapeHtml(s).replace(/\n/g, '<br>')
}

/**
 * A gentle opening line set by the cadence tone — grace, never guilt. 'return'
 * welcomes someone back after a gap; 'light' acknowledges they've already sat with
 * today. 'normal' opens with nothing extra. (See core/cadence.ts.)
 */
function toneOpener(tone: CadenceTone): string | null {
  if (tone === 'return') return "It's been a little while — there's no clock on this. When you're ready:"
  if (tone === 'light') return "You've already sat with today — no need to do it twice. But if something's still with you:"
  return null
}

// An honest way to turn the volume down. The true one-tap "less often" link needs a
// web endpoint (Gmail is send-only — we can't read a reply), so today it routes
// through the conversation: the assistant edits the rhythm via set_grounding.
const LESS_OFTEN = 'Fewer of these? Ask your assistant to adjust your rhythm.'

// Where the email's Claude door points. Gmail's sanitiser DROPS the href of any
// anchor whose scheme isn't http(s) — a `claude://` link arrives as dead text,
// so the tools are never reached and the reflection is silently never written.
// The fix is an https page that bounces to the scheme; see claudeDoor below.
// Set JOSHUA421_LINK_BASE='' to opt out and emit the raw scheme link instead.
const DEFAULT_LINK_BASE = 'https://kennie12345.github.io/joshua421/go/'

/**
 * The one Claude door — the link that opens a conversation with the joshua421
 * tools present. Used by BOTH emails, so the door has a single definition.
 *
 * It must open the user's LOCAL Claude Desktop, not claude.ai in a browser: the
 * MCP is a local stdio server the web app can't see, so an `https://claude.ai`
 * link would let them reflect while the diary is never written. Claude Desktop
 * takes `claude://claude.ai/new?q=…` (host + path routed, `q` its only allowed
 * query param) — but Gmail won't carry that link at all, so we front it with an
 * https page that redirects.
 *
 * The prompt rides in the FRAGMENT, not the query: fragments are never sent to
 * the server, so the day's calendar titles stay in the browser and the host of
 * the bounce page sees nothing but a bare page request.
 */
function claudeDoor(starter: string): string {
  const base = process.env.JOSHUA421_LINK_BASE ?? DEFAULT_LINK_BASE
  const q = encodeURIComponent(starter)
  return base ? `${base}#q=${q}` : `claude://claude.ai/new?q=${q}`
}

/**
 * A gentle cut for reading a kept summary back: whole words, an honest ellipsis.
 * Their words are read back, never rewritten — so a long one is trimmed, not
 * paraphrased.
 */
function excerpt(text: string, max = 400): string {
  const t = text.trim()
  if (t.length <= max) return t
  const cut = t.slice(0, max)
  const atWord = cut.lastIndexOf(' ')
  return `${(atWord > 0 ? cut.slice(0, atWord) : cut).replace(/[\s,;—–-]+$/, '')} …`
}

/**
 * Compose and send one of the two daily nudge-emails. It lists the day and points
 * the user into a reflective conversation with their own LLM — the questions arise
 * THERE, in the conversation, not here. The email is only the nudge; the frame it
 * carries opens the assistant question-first. The `tone` (from the cadence gate)
 * sets a gentle opener; `church` marks the church evening, where the look-back
 * widens to the week (the post-church frame and questions, at full weight). The
 * send itself is unconditional here — gating lives in sendDailyNudge, so this
 * stays a pure compose-and-send for the tests.
 */
export async function composeDayEmail(
  kind: 'morning' | 'evening',
  deps: Deps,
  opts: { tone?: CadenceTone; church?: boolean } = {},
): Promise<void> {
  const tone = opts.tone ?? 'normal'
  const church = (opts.church ?? false) && kind === 'evening'
  const opener = toneOpener(tone)
  // Host-zone boundary: "today" here (and day()'s query window behind it) is
  // the HOST's local day — correct while the worker runs on the user's own
  // machine (launchd), where host zone == user zone. Moving the worker to a
  // box in another zone requires user-zone day selection first; the per-event
  // wall-clock labels below are already host-independent.
  const today = isoDay(deps.clock())
  // The morning reads yesterday's kept summary back — their OWN words, live from
  // the Journal — so the memorial is felt daily, not only looked up. The evening
  // doesn't: its subject is the day just lived.
  const [events, yesterday] = await Promise.all([
    deps.diary.day(today),
    kind === 'morning' ? yesterdaySummary(today, deps) : Promise.resolve(null),
  ])

  // Deterministic day list — the assistant never invents events.
  const dayList = events.length
    ? events.map((e) => `• ${eventClock(e)} — ${e.title}`).join('\n')
    : '(nothing on your calendar today)'

  // The deep-link starter is SIMPLE on purpose: the day (the context) plus a
  // one-sentence ask. The deeper questions arise in the conversation — asked by
  // the assistant — not pre-baked into the prompt. (Yesterday's summary stays out
  // of the URL — the assistant reads it live via read_day; a reflection in a URL
  // leaks to browser history and logs.)
  const starter = [`My day (${today}):`, dayList, '', companionFrame(kind, { church })].join('\n')
  const claudeLink = claudeDoor(starter)
  // ChatGPT can't reach a local MCP at all, so this stays a reflect-only frame (the
  // user writes their own diary). Kept for cross-assistant reach.
  const chatgptLink = `https://chatgpt.com/?q=${encodeURIComponent(starter)}`

  // The paste path is its own way in, not a fallback copy of the link prompt:
  // two questions (rotated by date — see dayQuestions) the user answers in their
  // OWN words, then pastes question + answer into any assistant to go deeper —
  // or keeps in their diary as they are. The TONE must ride along: these questions
  // sit three lines under the opener, so a welcome-back that then asks what went
  // wrong is an accusation regardless of how the opener reads. On the church
  // evening the bank is the post-church one — the week's anchor at full weight.
  const [q1, q2] = dayQuestions(kind, today, tone, church)
  const pasteLead =
    'Or answer these yourself — then paste question and answer into any assistant to go deeper, or keep them in your diary:'

  // Yesterday's summary, read back in THEIR words — the memorial, felt daily.
  // Never a scorecard: it appears when there is something to read back, and is
  // simply absent when there isn't.
  const yesterdayLead = 'Yesterday you kept this — your words:'
  const yesterdayBlock = yesterday ? [yesterdayLead, `  ${excerpt(yesterday)}`, ''] : []

  const when = church ? 'after church' : kind === 'morning' ? 'this morning' : 'this evening'
  const body = [
    ...(opener ? [opener, ''] : []),
    ...yesterdayBlock,
    `Your day (${today}):`,
    dayList,
    '',
    'Reflect now — talk it through with your assistant:',
    `  Claude:  ${claudeLink}`,
    `  ChatGPT: ${chatgptLink}`,
    '',
    pasteLead,
    `  • ${q1}`,
    `  • ${q2}`,
    '',
    LESS_OFTEN,
  ].join('\n')

  // HTML twin: the links ride behind anchor text so the URL-encoded prompts stay
  // hidden. hrefs are safe unescaped: encodeURIComponent has already
  // percent-encoded &, <, > out of the query (and the fragment).
  const html = [
    '<div style="font-family:system-ui,-apple-system,sans-serif;line-height:1.5">',
    ...(opener ? [`<p>${escapeHtml(opener)}</p>`] : []),
    ...(yesterday
      ? [
          `<p style="color:#666">${escapeHtml(yesterdayLead)}<br>` +
            `<em>${htmlLines(excerpt(yesterday))}</em></p>`,
        ]
      : []),
    `<p><strong>Your day (${escapeHtml(today)}):</strong><br>${htmlLines(dayList)}</p>`,
    '<p>Reflect now — talk it through with your assistant:<br>',
    `<a href="${claudeLink}">Reflect with Claude&nbsp;→</a><br>`,
    `<a href="${chatgptLink}">Reflect with ChatGPT&nbsp;→</a></p>`,
    `<p style="color:#666">${escapeHtml(pasteLead)}</p>`,
    `<p style="color:#666">• ${escapeHtml(q1)}<br>• ${escapeHtml(q2)}</p>`,
    `<p style="color:#999;font-size:0.85em">${escapeHtml(LESS_OFTEN)}</p>`,
    '</div>',
  ].join('\n')

  await deps.mailer(`joshua421 · ${when}`, body, html)
}

/**
 * The welcome email — sent ONCE by `npm run setup`. It does double duty: it
 * proves the mail pipe works (the setup smoke test), and it marks the moment
 * setup is DONE by handing the user their first way in — the induction
 * conversation that establishes their grounding. Both doors lead to Claude
 * Desktop on purpose: setting up grounding *saves via the set_grounding tool*,
 * which only a joshua421-connected assistant has — so the deep-link opens
 * Desktop, and the paste block is its fallback (for mail clients that strip the
 * custom-scheme link), not a "works anywhere" path. Deterministic; no model
 * call, no calendar read.
 */
export async function sendWelcomeEmail(mailer: Deps['mailer']): Promise<void> {
  const claudeLink = claudeDoor(INDUCTION)
  const rhythm = [
    'A morning email helps you set the day before the Lord; an evening one helps you',
    'look back and notice where God was in it. Each points you into a short conversation',
    'with your own assistant — and what you choose to keep is written into your own',
    'calendar. joshua421 stores none of it.',
  ].join('\n')
  const firstStep =
    'First step — a short conversation to set up your preferences (what you hope God will grow in you, your tone, rhythm, church day):'
  // The link opens a fresh Claude Desktop conversation; if you just connected
  // joshua421, restart Desktop once so the tools are loaded before you begin.
  const restartNote = '(If you just ran setup, restart Claude Desktop once first, so joshua421 is loaded.)'
  const pasteLead = "If that link doesn't open, paste this into Claude Desktop (where joshua421 is connected):"

  const body = [
    "You're set up. From here, the rhythm is simple:",
    '',
    rhythm,
    '',
    firstStep,
    `  Begin with Claude:  ${claudeLink}`,
    `  ${restartNote}`,
    '',
    pasteLead,
    '',
    INDUCTION,
    '',
    LESS_OFTEN,
  ].join('\n')

  const html = [
    '<div style="font-family:system-ui,-apple-system,sans-serif;line-height:1.5">',
    "<p><strong>You're set up.</strong> From here, the rhythm is simple:</p>",
    `<p>${htmlLines(rhythm)}</p>`,
    `<p>${escapeHtml(firstStep)}<br>`,
    `<a href="${claudeLink}">Begin with Claude&nbsp;→</a><br>`,
    `<span style="color:#999;font-size:0.85em">${escapeHtml(restartNote)}</span></p>`,
    `<p style="color:#666">${escapeHtml(pasteLead)}</p>`,
    `<blockquote style="color:#666;border-left:3px solid #ddd;margin:0;padding-left:12px">${htmlLines(INDUCTION)}</blockquote>`,
    `<p style="color:#999;font-size:0.85em">${escapeHtml(LESS_OFTEN)}</p>`,
    '</div>',
  ].join('\n')

  await mailer("joshua421 · you're set up", body, html)
}

/**
 * The cadence gate before composing. Reads the rhythm (grounding) and the silence
 * (the Log), decides WHETHER and how gently to send, then composes with that tone.
 * A skip is a normal outcome — no send, no throw — so the worker just logs the
 * reason. This is the seam that lets the rhythm breathe.
 */
export async function sendDailyNudge(
  kind: 'morning' | 'evening',
  deps: Deps,
): Promise<{ sent: boolean; reason: string }> {
  const [grounding, reflections] = await Promise.all([deps.grounding.get(), deps.log.reflections()])
  const now = deps.clock()
  const cadence = parseCadence(grounding)
  const decision = decideCadence({ kind, now, cadence, reflections })
  if (!decision.send) return { sent: false, reason: decision.reason }
  // The church evening widens the look-back to the week. Computed here (not from
  // the decision's reason) because an already-reflected church evening still
  // deserves the post-church frame — its reason is 'already-reflected'.
  const church = kind === 'evening' && cadence.churchDay === now.getDay()
  await composeDayEmail(kind, deps, { tone: decision.tone, church })
  return { sent: true, reason: decision.reason }
}

export { isoDay }
