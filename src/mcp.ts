import './env'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import type { Deps } from './core/deps'
import { z } from 'zod'
import { readDay, applyDayNotes, isoDay } from './core/flows'
import { makeSqliteLog } from './log-sqlite'
import { makeClaudeReflector } from './claude'
import { makeGoogleDiary, makeGoogleMailer } from './google'
import { makeFileGrounding } from './grounding-file'

/**
 * ENTRYPOINT 1 — a thin stdio MCP server. Wires concrete adapters into the same
 * engine flows, then exposes them as tools you can call from your own Claude.
 * No business logic of its own.
 */

// Boot diagnostic — stderr only (shows in Claude Desktop's MCP log; never on
// stdout, where it would corrupt the protocol). No secrets, just presence.
console.error(
  `[joshua421] boot · cwd=${process.cwd()} · db=${process.env.JOSHUA421_DB} · ` +
    `anthropic=${process.env.ANTHROPIC_API_KEY ? 'set' : 'MISSING'} · ` +
    `google=${process.env.GOOGLE_REFRESH_TOKEN ? 'set' : 'MISSING'}`,
)

const deps: Deps = {
  reflect: makeClaudeReflector(),
  mailer: makeGoogleMailer(),
  diary: makeGoogleDiary(),
  grounding: makeFileGrounding(),
  log: makeSqliteLog(),
  clock: () => new Date(),
}

const server = new McpServer({ name: 'joshua421', version: '0.1.0' })

// ── reflect on the day in conversation, then weave approved notes into the calendar ──

server.registerTool(
  'read_day',
  {
    description:
      "Read the day's calendar entries so you can reflect WITH the user on their day. " +
      "Reflect from THIS day and the user's own words — never generic. Any encouraging note " +
      'you draft must name a concrete particular of the day; no Christianese, no platitudes, ' +
      'no emoji, no formulaic shape. Propose the notes (and a short day summary) to the user, ' +
      'and only call apply_day_notes with what they approve. Defaults to today.',
    inputSchema: { date: z.string().optional() },
  },
  async ({ date }) => {
    const day = date ?? isoDay(new Date())
    const [events, goals] = await Promise.all([readDay(day, deps), deps.grounding.get()])
    return { content: [{ type: 'text', text: JSON.stringify({ date: day, goals, events }, null, 2) }] }
  },
)

server.registerTool(
  'apply_day_notes',
  {
    description:
      'Write the user-APPROVED notes into their calendar (additive — appended under a marker, ' +
      "never rewriting their words), plus an optional day summary as an all-day entry. Only " +
      'call this with notes the user has explicitly approved.',
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
  { description: "Read the user's saved goals / grounding. Empty if not set yet." },
  async () => {
    const goals = await deps.grounding.get()
    return { content: [{ type: 'text', text: goals ?? '(no grounding saved yet)' }] }
  },
)

server.registerTool(
  'set_grounding',
  {
    description:
      "Save the user's goals — what they want God to grow in them. Ask about their goals " +
      'first, compose a concise statement, confirm it with them, then save. This grounds all ' +
      'future reflections. The user owns it and can edit or clear it anytime.',
    inputSchema: { goals: z.string() },
  },
  async ({ goals }) => {
    await deps.grounding.set(goals)
    return { content: [{ type: 'text', text: 'Grounding saved.' }] }
  },
)

async function main() {
  const transport = new StdioServerTransport()
  await server.connect(transport)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
