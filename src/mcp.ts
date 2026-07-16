import './env'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { z } from 'zod'
import { readDay, applyDayNotes, isoDay } from './core/flows'
import { makeProdDeps } from './prod-deps'
import { COMPANION_INSTRUCTIONS, FIXED_CENTRE, INDUCTION } from './core/persona'

/**
 * ENTRYPOINT 1 — a thin stdio MCP server. Wires concrete adapters into the same
 * engine flows, then exposes them as tools you can call from your own Claude.
 * No business logic of its own.
 */

// Boot diagnostic — stderr only (shows in Claude Desktop's MCP log; never on
// stdout, where it would corrupt the protocol). No secrets, just presence.
console.error(
  `[joshua421] boot · cwd=${process.cwd()} · db=${process.env.JOSHUA421_DB} · ` +
    `google=${process.env.GOOGLE_REFRESH_TOKEN ? 'set' : 'MISSING'}`,
)

const deps = makeProdDeps()

// The `instructions` are injected into the host LLM as context about this server,
// so the WHOLE conversation is in character — not just the moment a tool fires.
const server = new McpServer(
  { name: 'joshua421', version: '0.1.0' },
  { instructions: COMPANION_INSTRUCTIONS },
)

// ── reflect on the day in conversation, then weave approved notes into the calendar ──

server.registerTool(
  'read_day',
  {
    description:
      "Read the day's calendar entries so you can reflect WITH the user on their day — " +
      "from THIS day and the user's own words, never generic. Propose what you draft, then " +
      'call apply_day_notes to weave in their choices. Defaults to today. ' +
      FIXED_CENTRE,
    inputSchema: { date: z.string().optional() },
  },
  async ({ date }) => {
    const day = date ?? isoDay(new Date())
    const [events, goals] = await Promise.all([readDay(day, deps), deps.grounding.get()])
    // Present each event as the user's CALENDAR renders it (startLocal), never
    // as a bare UTC instant — JSON.stringify would render a Sydney 23:00 event as
    // "13:00Z", and the host LLM would tell the user "1pm", ten hours wrong.
    // timeZone rides along only when it agrees with that rendering (see deps.ts).
    const shaped = events.map(({ start, startLocal, timeZone, ...rest }) => ({
      ...rest,
      start: startLocal ?? start.toISOString(),
      ...(timeZone ? { timeZone } : {}),
    }))
    // No grounding yet: say so IN the tool result, where the assistant is
    // actually looking (the `begin` prompt covers this too, but it hides in the
    // client's prompt picker). A standing fact, not a repeated pitch — if they've
    // waved it off before, don't press; you can still reflect from the day alone.
    const ungrounded = goals
      ? {}
      : {
          groundingSet: false,
          hint:
            'No preferences are saved yet. If it fits the moment, you might gently offer to set them ' +
            'up — what they hope God will grow in them this season, then tone, rhythm, church day, ' +
            'quiet time, saved with set_grounding (partial is fine) — but only once, lightly; if they ' +
            "aren't interested, let it be and reflect from the day itself.",
        }
    return { content: [{ type: 'text', text: JSON.stringify({ date: day, goals, events: shaped, ...ungrounded }, null, 2) }] }
  },
)

server.registerTool(
  'apply_day_notes',
  {
    description:
      'Write the user-APPROVED notes into their calendar (additive — appended under a marker, ' +
      "never rewriting their words), plus an optional day summary as an all-day entry. The " +
      'content may be a gentle note drafted together, the user\'s own words saved verbatim, or — ' +
      'if they want to reflect in their diary themselves — the chosen reflection\'s questions, ' +
      'placed in the notes for them to answer. ' +
      FIXED_CENTRE,
    inputSchema: {
      date: z.string(),
      notes: z.array(z.object({ eventId: z.string(), note: z.string() })),
      summary: z.string().optional(),
    },
  },
  async ({ date, notes, summary }) => {
    await applyDayNotes({ date, notes, summary }, deps)
    const parts = [`Wrote ${notes.length} note(s) into ${date}.`]
    if (summary) parts.push('Added a day summary.')
    parts.push('Reflection recorded.')
    return { content: [{ type: 'text', text: parts.join(' ') }] }
  },
)

// ── grounding: the user's goals — the one stored content, used to ground everything ──

server.registerTool(
  'get_grounding',
  {
    description:
      "Read the user's saved preferences — the grounding for every reflection and email " +
      '(goals, tone, weekly rhythm, church day/time, quiet-time slot). Empty if not set yet.',
  },
  async () => {
    const prefs = await deps.grounding.get()
    const empty =
      '(no preferences saved yet. If it fits the moment, you might gently offer to set them up — ' +
      'what they hope God will grow in them this season, then tone, rhythm, church day, quiet time — ' +
      'a conversation, not a form — saved with set_grounding (partial is fine). Only once, lightly; ' +
      "if they aren't interested, let it be.)"
    return { content: [{ type: 'text', text: prefs ?? empty }] }
  },
)

server.registerTool(
  'set_grounding',
  {
    description:
      "Save the user's preferences — the grounding for every reflection and email. Cover, in " +
      'their own words: their objectives and goals (what they want God to grow in them); the ' +
      'language and tone they want (gentle or direct, plain or poetic); their weekly rhythm and ' +
      'how often they want to reflect; their church day and time; and any daily quiet-time slot. ' +
      'Ask about these conversationally first, compose a concise plain-text document (suggested ' +
      'headings: Goals, Tone & language, Rhythm, Church, Quiet time), confirm it with them, then ' +
      'save. So the daily-email cadence can honour it, include two machine-readable lines when ' +
      'you know them: a "Rhythm:" line whose value is one of daily | weekdays | weekends | weekly ' +
      '| mornings only | evenings only (these exact words), and a "Church:" line naming the day ' +
      '(e.g. "Church: Sunday"). Partial is fine — save what they have shared. They own it and can ' +
      'edit or clear it anytime.',
    inputSchema: { preferences: z.string() },
  },
  async ({ preferences }) => {
    await deps.grounding.set(preferences)
    return { content: [{ type: 'text', text: 'Preferences saved.' }] }
  },
)

// ── induction: the initial prompt a new user runs once, to set up their memory ──

// An MCP prompt (user-invoked in the client, e.g. Claude Desktop's prompt picker)
// that seeds the first conversation. It hands the assistant the induction flow —
// establish the user's preferences as a conversation, then persist them via
// set_grounding — so a first run reliably sets up the grounding instead of relying
// on the assistant to infer that it's a first visit. Same INDUCTION text also fits
// the welcome email's deep-link, so both on-ramps share one source.
server.registerPrompt(
  'begin',
  {
    title: 'Begin with joshua421 — set up your preferences',
    description:
      'Run once when you first start: a gentle conversation that establishes your ' +
      'preferences (goals, tone, rhythm, church day, quiet time) and saves them as ' +
      "joshua421's memory, so every reflection and nudge is grounded in them.",
  },
  () => ({ messages: [{ role: 'user', content: { type: 'text', text: INDUCTION } }] }),
)

async function main() {
  const transport = new StdioServerTransport()
  await server.connect(transport)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
