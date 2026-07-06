import { randomUUID } from 'node:crypto'
import type { Deps, DayEvent } from './deps'
import type { Reflection } from './reflection'
import { companionFrame, dayQuestions } from './persona'
import { isoDay } from './day'
import { parseCadence, decideCadence, type CadenceTone } from './cadence'

/**
 * Read the day's calendar entries for reflection. The conversation with Claude
 * does the reflecting — this just hands it the canvas.
 */
export async function readDay(date: string, deps: Deps): Promise<DayEvent[]> {
  return deps.diary.day(date)
}

/**
 * Apply the user-APPROVED notes (additive, into each event) plus an optional
 * day summary, and record that they reflected. Content flows through here but is
 * never stored — it goes to the user's own calendar; the log keeps behaviour only.
 */
export async function applyDayNotes(
  input: { date: string; notes: { eventId: string; note: string }[]; summary?: string },
  deps: Deps,
): Promise<Reflection> {
  for (const n of input.notes) await deps.diary.annotate(n.eventId, n.note)
  if (input.summary) await deps.diary.writeSummary(input.date, input.summary)
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

/**
 * Compose and send one of the two daily nudge-emails. It lists the day and points
 * the user into a reflective conversation with their own LLM — the questions arise
 * THERE, in the conversation, not here. The email is only the nudge; the frame it
 * carries opens the assistant question-first. The `tone` (from the cadence gate)
 * sets a gentle opener; the send itself is unconditional here — gating lives in
 * sendDailyNudge, so this stays a pure compose-and-send for the tests.
 */
export async function composeDayEmail(
  kind: 'morning' | 'evening',
  deps: Deps,
  opts: { tone?: CadenceTone } = {},
): Promise<void> {
  const opener = toneOpener(opts.tone ?? 'normal')
  // Host-zone boundary: "today" here (and day()'s query window behind it) is
  // the HOST's local day — correct while the worker runs on the user's own
  // machine (launchd), where host zone == user zone. Moving the worker to a
  // box in another zone requires user-zone day selection first; the per-event
  // wall-clock labels below are already host-independent.
  const today = isoDay(deps.clock())
  const events = await deps.diary.day(today)

  // Deterministic day list — the assistant never invents events.
  const dayList = events.length
    ? events.map((e) => `• ${eventClock(e)} — ${e.title}`).join('\n')
    : '(nothing on your calendar today)'

  // The deep-link starter is SIMPLE on purpose: the day (the context) plus a
  // one-sentence ask. The deeper questions arise in the conversation — asked by
  // the assistant — not pre-baked into the prompt.
  const starter = [`My day (${today}):`, dayList, '', companionFrame(kind)].join('\n')
  // Open the user's LOCAL Claude Desktop, NOT claude.ai in a browser — the joshua421
  // MCP is a local stdio server, and the web app can't see it, so a `https://claude.ai`
  // link would let them reflect while the diary is *silently never written*. The
  // `claude://` scheme hands off to Claude Desktop, whose globally-configured MCP
  // servers are present in the new conversation, so read_day / apply_day_notes work.
  // (Claude Code users: `claude-cli://open?q=…`, app v2.1.91+. Deliverability caveat:
  // some webmail clients strip custom-scheme hrefs — productionise behind an https
  // landing page that redirects to the scheme; see hosted-paid.notes.md.)
  const claudeLink = `claude://claude.ai/new?q=${encodeURIComponent(starter)}`
  // ChatGPT can't reach a local MCP at all, so this stays a reflect-only frame (the
  // user writes their own diary). Kept for cross-assistant reach.
  const chatgptLink = `https://chatgpt.com/?q=${encodeURIComponent(starter)}`

  // The paste path is its own way in, not a fallback copy of the link prompt:
  // two questions (rotated by date — see dayQuestions) the user answers in their
  // OWN words, then pastes question + answer into any assistant to go deeper —
  // or keeps in their diary as they are.
  const [q1, q2] = dayQuestions(kind, today)
  const pasteLead =
    'Or answer these yourself — then paste question and answer into any assistant to go deeper, or keep them in your diary:'

  const when = kind === 'morning' ? 'this morning' : 'this evening'
  const body = [
    ...(opener ? [opener, ''] : []),
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

  // HTML twin: the links ride behind anchor text so the URL-encoded ?q= prompts
  // stay hidden. hrefs are safe unescaped: encodeURIComponent has already
  // percent-encoded &, <, > out of the query.
  const html = [
    '<div style="font-family:system-ui,-apple-system,sans-serif;line-height:1.5">',
    ...(opener ? [`<p>${escapeHtml(opener)}</p>`] : []),
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
  const decision = decideCadence({ kind, now: deps.clock(), cadence: parseCadence(grounding), reflections })
  if (!decision.send) return { sent: false, reason: decision.reason }
  await composeDayEmail(kind, deps, { tone: decision.tone })
  return { sent: true, reason: decision.reason }
}

export { isoDay }
