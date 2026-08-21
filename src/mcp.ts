import './env'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { z } from 'zod'
import { readDay, applyDayNotes, lookBack, saveRollup, undoWrite, isoDay } from './core/flows'
import { makeProdDeps } from './prod-deps'
import { COMPANION_INSTRUCTIONS, INDUCTION } from './core/persona'
import { describeTool } from './core/centre'
import { skillIndex } from './core/skills'
import { loadSkills } from './adapters/skills-fs'

/**
 * ENTRYPOINT 1 — a thin stdio MCP server. Wires concrete adapters into the same
 * engine flows, then exposes them as tools you can call from your own Claude.
 * No business logic of its own.
 */

// Boot diagnostic — stderr only (shows in Claude Desktop's MCP log; never on
// stdout, where it would corrupt the protocol). No secrets, just presence.
console.error(
  `[joshua421] boot · cwd=${process.cwd()} · store=${process.env.JOSHUA421_CALENDAR_ID ?? 'primary'} · ` +
    `google=${process.env.GOOGLE_REFRESH_TOKEN ? 'set' : 'MISSING'}`,
)

const deps = makeProdDeps()
const skills = loadSkills()
const skillsByName = new Map(skills.map((skill) => [skill.name, skill]))
const availableSkills = skillIndex(skills)

// The `instructions` are injected into the host LLM as context about this server,
// so the WHOLE conversation is in character — not just the moment a tool fires.
const server = new McpServer(
  { name: 'joshua421', version: '0.1.0' },
  { instructions: COMPANION_INSTRUCTIONS },
)

// ── practices: portable resources for standards clients, one loader for runtime ──

for (const skill of skills) {
  const uri = `skill://joshua421/${skill.name}`
  server.registerResource(
    skill.name,
    uri,
    { title: skill.name, description: skill.description, mimeType: 'text/markdown' },
    async () => ({ contents: [{ uri, mimeType: 'text/markdown', text: skill.markdown }] }),
  )
}

server.registerTool(
  'load_skill',
  {
    description: describeTool(
      'load',
      "Load the practice's shape before running it; the list is for you to choose from and must " +
        'never be read aloud as a menu.\n' +
        availableSkills,
    ),
    inputSchema: { name: z.string() },
  },
  async ({ name }) => {
    const skill = skillsByName.get(name)
    return { content: [{ type: 'text', text: skill?.markdown ?? availableSkills }] }
  },
)

// ── reflect on the day in conversation, then weave approved notes into the calendar ──

server.registerTool(
  'read_day',
  {
    description: describeTool(
      'reflect',
      "Read the day's calendar entries so you can reflect WITH the user on their day — " +
        "from THIS day and the user's own words, never generic. Propose what you draft, then " +
        'call apply_day_notes to weave in their choices. Defaults to today. ',
    ),
    inputSchema: { date: z.string().optional() },
  },
  async ({ date }) => {
    const day = date ?? isoDay(new Date())
    const [{ events, yesterdaySummary }, grounding] = await Promise.all([
      readDay(day, deps),
      deps.grounding.get(),
    ])
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
    const ungrounded = grounding
      ? {}
      : {
          groundingSet: false,
          hint:
            'No grounding is saved yet. If it fits the moment, you might gently offer to set it up ' +
            'up — what they hope God will grow in them this season, then tone, rhythm, church day, ' +
            'quiet time, saved with set_grounding (partial is fine) — but only once, lightly; if they ' +
            "aren't interested, let it be and reflect from the day itself.",
        }
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(
            {
              date: day,
              grounding,
              events: shaped,
              // Yesterday's kept summary — THEIR words, read live from their
              // calendar — so today's reflection can continue a thread rather
              // than start cold. Absent when they kept nothing; never a gap to
              // remark on.
              ...(yesterdaySummary ? { yesterdaySummary } : {}),
              ...ungrounded,
            },
            null,
            2,
          ),
        },
      ],
    }
  },
)

server.registerTool(
  'apply_day_notes',
  {
    description: describeTool(
      'write',
      'Write the user-APPROVED notes into their calendar (additive — appended under a marker, ' +
        "never rewriting their words), plus an optional day summary as an all-day entry. The " +
        'content may be a gentle note drafted together, the user\'s own words saved verbatim, or — ' +
        'if they want to reflect in their diary themselves — the chosen reflection\'s questions, ' +
        'placed in the notes for them to answer. Each note chooses its placement: "note" (default) ' +
        'writes into the event itself; "side" keeps a PRIVATE side-entry in the same time slot, ' +
        'leaving the event untouched — required for a shared or public event (read_day marks these ' +
        '`shared`; a note written into one would sync to every attendee), and available whenever ' +
        'the user prefers it. ',
    ),
    inputSchema: {
      date: z.string(),
      notes: z.array(
        z.object({
          eventId: z.string(),
          note: z.string(),
          placement: z.enum(['note', 'side']).optional(),
        }),
      ),
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

server.registerTool(
  'undo_write',
  {
    description: describeTool(
      'reverse',
      "Reverse a joshua421 write, at the user's request — every write stays reversible. Action " +
        '"strip_note" removes ONLY joshua421\'s fenced block from their event: their own words ' +
        'survive, even ones they added after it, and any ambiguity is a safe no-op. Action ' +
        '"delete_entry" deletes an entry joshua421 CREATED — a side entry, a day summary, a rollup — ' +
        'and refuses anything else: their real events are structurally out of reach. Reverse exactly ' +
        'what they ask, nothing more. ',
    ),
    inputSchema: {
      eventId: z.string(),
      action: z.enum(['strip_note', 'delete_entry']),
    },
  },
  async ({ eventId, action }) => {
    await undoWrite({ eventId, action }, deps)
    return {
      content: [
        {
          type: 'text',
          text:
            action === 'strip_note'
              ? 'Removed joshua421’s note from the event; the user’s own words are untouched.'
              : 'Deleted the joshua421-created entry.',
        },
      ],
    }
  },
)

// ── the memorial: look back over a horizon, and keep what it distils to ──────

server.registerTool(
  'look_back',
  {
    description: describeTool(
      'gather',
      'Gather the raw material for a look-back over a period — the memorial ("look how faithful ' +
        'God has been", Joshua 4). Returns the days they showed up, the day-summaries they kept (their ' +
        'OWN words), and any rollups already written. YOU weave it in the conversation: lead with what ' +
        'God did, in their words; presence reads as memorial ("look how God has met you"), NEVER as a ' +
        'scorecard — no counting the days they were absent. Natural moments: their church evening (the ' +
        "week's look-back), a month or season genuinely turning, or whenever they ask. When a look-back " +
        'lands somewhere true, offer to keep it with save_rollup. Pass since/until, or level + date ' +
        '(the period around that date); no range means this week. ',
    ),
    inputSchema: {
      since: z.string().optional(),
      until: z.string().optional(),
      level: z.enum(['week', 'month', 'season', 'year']).optional(),
      date: z.string().optional(),
    },
  },
  async (input) => {
    const memorial = await lookBack(input, deps)
    return { content: [{ type: 'text', text: JSON.stringify(memorial, null, 2) }] }
  },
)

server.registerTool(
  'save_rollup',
  {
    description: describeTool(
      'keep',
      "Keep a user-APPROVED look-back distillation as that period's own calendar entry — a stone in " +
        'the memorial (one per week / month / season / year; re-keeping a period replaces its stone). ' +
        'Write it in THEIR voice from the conversation — the particulars they named, what God did — and ' +
        'confirm the text with them before saving. The year rollup is the headline: "your year with ' +
        'God". ',
    ),
    inputSchema: {
      level: z.enum(['week', 'month', 'season', 'year']),
      date: z.string(),
      body: z.string(),
      title: z.string().optional(),
    },
  },
  async ({ level, date, body, title }) => {
    const { period } = await saveRollup({ level, date, body, title }, deps)
    return { content: [{ type: 'text', text: `Kept the ${level} rollup (${period}) in your calendar.` }] }
  },
)

// ── grounding: what the person named — the one stored content, used to ground everything ──

server.registerTool(
  'get_grounding',
  {
    description: describeTool(
      'recall',
      "Read the user's grounding — their own account of what they are asking God to grow in them " +
        'and how they want to be met (intention, tone, weekly rhythm, church day/time, quiet-time ' +
        'slot, and what helps when they come back after a while). Empty if not set yet.',
    ),
  },
  async () => {
    const prefs = await deps.grounding.get()
    const empty =
      '(no grounding saved yet. If it fits the moment, you might gently offer to set it up — ' +
      'what they hope God will grow in them this season, then tone, rhythm, church day, quiet time — ' +
      'a conversation, not a form — saved with set_grounding (partial is fine). Only once, lightly; ' +
      "if they aren't interested, let it be.)"
    return { content: [{ type: 'text', text: prefs ?? empty }] }
  },
)

server.registerTool(
  'set_grounding',
  {
    description: describeTool(
      'remember',
      "Save the user's grounding — what every reflection and email is grounded in. Cover, in " +
        'their own words: the intention they name (what they are asking God to grow in them); the ' +
        'language and tone they want (gentle or direct, plain or poetic); their weekly rhythm and ' +
        'how often they want to reflect; their church day and time; and any daily quiet-time slot. ' +
        'Ask about these conversationally first, compose a concise plain-text document (suggested ' +
        'headings: Intention, Tone & language, Rhythm, Church, Quiet time), confirm it with them, then ' +
        'save. So the daily-email cadence can honour it, include three machine-readable lines when ' +
        'you know them: a "Rhythm:" line whose value is one of daily | weekdays | weekends | weekly ' +
        '| mornings only | evenings only (these exact words); a "Church:" line naming the day ' +
        '(e.g. "Church: Sunday"); and an "Orientation:" line — steady | reassure | space | gentle — ' +
        'recording what THEY said helps when they have been away a while and are coming back ' +
        '(steady = a gap is just a busy week; reassure = they need to know nothing was lost; ' +
        'space = they want room and no questions; gentle = both). It sets how much the nudge asks ' +
        'of them during a quiet stretch, never whether it comes. Write it ONLY from what they ' +
        'actually said — if they did not say, leave the line out; never infer it from how they ' +
        'behave, and never say a label back to them as a fact about who they are. ' +
        'Partial is fine — save what they have shared. They own it and can edit or clear it anytime.',
    ),
    inputSchema: { grounding: z.string() },
  },
  async ({ grounding }) => {
    await deps.grounding.set(grounding)
    return { content: [{ type: 'text', text: 'Grounding saved.' }] }
  },
)

// ── induction: the initial prompt a new user runs once, to set up their memory ──

// An MCP prompt (user-invoked in the client, e.g. Claude Desktop's prompt picker)
// that seeds the first conversation. It hands the assistant the induction flow —
// establish the user's grounding as a conversation, then persist it via
// set_grounding — so a first run reliably sets up the grounding instead of relying
// on the assistant to infer that it's a first visit. Same INDUCTION text also fits
// the welcome email's deep-link, so both on-ramps share one source.
server.registerPrompt(
  'begin',
  {
    title: 'Begin with joshua421 — set up your grounding',
    description:
      'Run once when you first start: a gentle conversation that establishes your ' +
      'grounding (the intention they name, tone, rhythm, church day, quiet time) and saves it as ' +
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
