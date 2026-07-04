import { randomUUID } from 'node:crypto'
import type { Deps, DayEvent } from './deps'
import type { Reflection } from './reflection'
import { companionFrame } from './persona'

/**
 * ISO local day (YYYY-MM-DD) for a Date. Local calendar fields so the record
 * date, the look-back window, and the log's streak walk all agree on the
 * user's local day.
 */
function isoDay(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

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
 * Compose and send one of the two daily nudge-emails. It lists the day and points
 * the user into a reflective conversation with their own LLM — the questions arise
 * THERE, in the conversation, not here. The email is only the nudge; the frame it
 * carries opens the assistant question-first.
 */
export async function composeDayEmail(kind: 'morning' | 'evening', deps: Deps): Promise<void> {
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

  // A starter they can take to ANY assistant, with deep links for the common ones.
  // It carries the companion FRAME (so a persona-less web assistant reflects in
  // character) plus the actual day (the particulars to reflect on). No pre-baked
  // questions — the assistant asks them in the conversation.
  const starter = [companionFrame(kind), '', `My day (${today}):`, dayList].join('\n')
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

  const when = kind === 'morning' ? 'this morning' : 'this evening'
  const body = [
    `Your day (${today}):`,
    dayList,
    '',
    'Reflect now — talk it through with your assistant:',
    `  Claude:  ${claudeLink}`,
    `  ChatGPT: ${chatgptLink}`,
    '',
    'Or paste this into any assistant you use:',
    starter,
  ].join('\n')

  // HTML twin: the links ride behind anchor text so the (unavoidably long — the
  // whole prompt is URL-encoded into ?q=) URLs stay hidden. The paste-fallback
  // survives verbatim in a <pre>, because a client may truncate an over-long deep
  // link. hrefs are safe unescaped: encodeURIComponent has already percent-encoded
  // &, <, > out of the query.
  const html = [
    '<div style="font-family:system-ui,-apple-system,sans-serif;line-height:1.5">',
    `<p><strong>Your day (${escapeHtml(today)}):</strong><br>${htmlLines(dayList)}</p>`,
    '<p>Reflect now — talk it through with your assistant:<br>',
    `<a href="${claudeLink}">Reflect with Claude&nbsp;→</a><br>`,
    `<a href="${chatgptLink}">Reflect with ChatGPT&nbsp;→</a></p>`,
    '<p style="color:#666">Or paste this into any assistant you use:</p>',
    `<pre style="white-space:pre-wrap;color:#666;font-size:0.9em">${escapeHtml(starter)}</pre>`,
    '</div>',
  ].join('\n')

  await deps.mailer(`joshua421 · ${when}`, body, html)
}

export { isoDay }
