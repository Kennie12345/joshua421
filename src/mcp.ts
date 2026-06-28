import './env'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import type { Deps } from './core/deps'
import { reflectOnDay, lookBack, prepareForEvent } from './core/flows'
import { makeSqliteLog } from './log-sqlite'
import { makeClaudeReflector } from './claude'
import { makeGoogleNotifier, makeGoogleSource } from './google'

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
  source: makeGoogleSource(),
  reflect: makeClaudeReflector(),
  notify: makeGoogleNotifier(),
  log: makeSqliteLog(),
  clock: () => new Date(),
}

const server = new McpServer({ name: 'joshua421', version: '0.1.0' })

server.registerTool(
  'reflect_on_day',
  { description: "Reflect on the day that passed, tying it back to God's faithfulness, and deliver it." },
  async () => {
    const { note } = await reflectOnDay(deps)
    return { content: [{ type: 'text', text: `${note.text}\n\n— also sent to your inbox. (Reflection recorded.)` }] }
  },
)

server.registerTool(
  'look_back',
  { description: 'Look back over your reflections — "look how faithful God has been."' },
  async () => {
    const note = await lookBack(deps)
    return { content: [{ type: 'text', text: `${note.text}\n\n— also sent to your inbox.` }] }
  },
)

server.registerTool(
  'prepare_for_event',
  { description: 'Bring a God-honouring posture into the next upcoming event.' },
  async () => {
    const events = await deps.source.upcomingEvents(24)
    if (events.length === 0) {
      return { content: [{ type: 'text', text: 'No upcoming events in the next 24 hours.' }] }
    }
    const { note } = await prepareForEvent(events[0], deps)
    return {
      content: [
        { type: 'text', text: `Preparing for "${events[0].title}":\n\n${note.text}\n\n— also sent to your inbox. (Reflection recorded.)` },
      ],
    }
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
