import './env'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import type { Deps } from './core/deps'
import { reflectOnDay, lookBack, prepareForEvent } from './core/flows'
import { makeSqliteCairn } from './cairn-sqlite'
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
  `[joshua421] boot · cwd=${process.cwd()} · db=${process.env.CAIRN_DB_PATH} · ` +
    `anthropic=${process.env.ANTHROPIC_API_KEY ? 'set' : 'MISSING'} · ` +
    `google=${process.env.GOOGLE_REFRESH_TOKEN ? 'set' : 'MISSING'}`,
)

const deps: Deps = {
  source: makeGoogleSource(),
  reflect: makeClaudeReflector(),
  notify: makeGoogleNotifier(),
  cairn: makeSqliteCairn(),
  clock: () => new Date(),
}

const server = new McpServer({ name: 'joshua421', version: '0.1.0' })

server.registerTool(
  'reflect_on_day',
  {
    description: 'Reflect on the day that passed, tying it back to God’s faithfulness, and deliver it.',
  },
  async () => {
    const stone = await reflectOnDay(deps)
    return { content: [{ type: 'text', text: `Reflection sent. Stone laid: ${stone.id}` }] }
  },
)

server.registerTool(
  'look_back',
  {
    description: 'Look back over the cairn — "look how faithful God has been."',
  },
  async () => {
    const r = await lookBack(deps)
    return { content: [{ type: 'text', text: r.text }] }
  },
)

server.registerTool(
  'prepare_for_event',
  {
    description: 'Bring a God-honouring posture into the next upcoming event.',
  },
  async () => {
    const events = await deps.source.upcomingEvents(24)
    if (events.length === 0) {
      return { content: [{ type: 'text', text: 'No upcoming events in the next 24 hours.' }] }
    }
    const stone = await prepareForEvent(events[0], deps)
    return { content: [{ type: 'text', text: `Prepared for "${events[0].title}". Stone laid: ${stone.id}` }] }
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
