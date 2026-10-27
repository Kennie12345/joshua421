# joshua421

> "When your children ask in time to come, 'What do these stones mean?'
> then you shall let your children know..." (**Joshua 4:21–22**)

In Joshua 4, Israel crosses the Jordan and piles twelve stones into a memorial,
so that later, when the question comes, the story of God's faithfulness gets
retold. That memory, carried into the rhythm of a life, is the spirit of this
project.

**joshua421 is a provider-agnostic MCP server that lets your own LLM help you
reflect on your day and set it before the Lord, then writes what you approve
into your Google Calendar.** It makes no model calls of its own and stores
nothing on a server: your calendar is the database.

**Stack:** TypeScript (Node, ESM) · Model Context Protocol SDK (stdio server,
tools, prompts, resources) · Google Calendar and Gmail (send-only) APIs via
`googleapis` · `node-cron` and macOS launchd for scheduled nudges · Zod ·
`node:test` (151 tests).

## What it is

It is *not* a devotional you read passively. *You* reflect, actively, with your
own LLM (Claude, ChatGPT, a local model); joshua421 is the tools, the memory,
and the write-surface. The loop: an **email** nudges you, a link opens **your
LLM**, it helps you reflect and set the day up for the Lord, with your
**approval** it writes notes into your calendar, and joshua421 records *that*
you reflected, never *what* you said.

Four promises:

- **Behaviour, not content.** joshua421 itself stores nothing at all: no
  server, no database, nothing on your machine. A reflected day is one empty
  Marker entry. Anything with words in it (a note, a day summary, a rollup,
  your grounding) is written only where you approved it, in *your* calendar,
  as private as your calendar is.
- **Additive.** It never rewrites or deletes your words.
- **Permission at the boundary.** Nothing is written without your approval in
  chat. Today that is held by the companion's instructions, not yet by the
  protocol.
- **Grace, not guilt.** A memorial to God's faithfulness, not a scorecard.

**Presence holds; the ask scales.** A quiet stretch changes how much the nudge
asks of you, never whether it arrives. How you want to be met on the way back
is something *you* name once, in plain words; nothing is ever inferred from how
you behave. See [ADR 0006](./docs/adr/0006-presence-holds-the-ask-scales.md).

Because joshua421 makes **no model calls of its own**, you bring whichever
assistant you like and no LLM key is needed. [docs/design.md](./docs/design.md)
has the full vision and privacy model.

## How you use it

You never call joshua421 directly. You talk to your assistant; the assistant
calls the tools.

**Once.** `npm run setup` connects joshua421 to your assistant. Then run the
**`begin`** prompt (in your client's prompt picker): a gentle conversation that
establishes your intention, tone, weekly rhythm, church day and quiet time, and
saves them with `set_grounding` as one entry in your own calendar, still yours
to edit by hand.

**Each day.** A nudge email arrives, a morning setup and an evening summary,
the morning one carrying yesterday's summary back to you in your own words. It
offers two ways in: a link that opens the conversation already prefilled (into
Claude Desktop, where the MCP is connected and your diary can be written; the
ChatGPT link reflects with you but writes nothing), or two questions you can
paste into any assistant. In the conversation, yours reads your grounding
(`get_grounding`) and your day (`read_day`) and reflects with you on *this*
day: your actual events, your own words. When something is worth keeping it
drafts it, you approve it, and `apply_day_notes` writes it, appended under a
marker inside the event, or as a private side-entry in the same slot when the
event is shared, so a reflection of yours never lands on someone else's invite.
Every write is reversible. `undo_write` strips only joshua421's block from your
event, or deletes an entry joshua421 created; your real meetings are
structurally out of reach.

**Now and then.** On your church evening, at a month or season genuinely
turning, or whenever you ask: `look_back` gathers that period's stones (the
days you showed up, the summaries you kept, the rollups already written) and
your assistant weaves the memorial with you: *look how faithful God has been.*
If it lands somewhere true, `save_rollup` keeps it as that period's own entry.
"Your year with God" is the headline stone.

**Practices.** Six guided practices live in [`skills/`](./skills) as portable
`SKILL.md` files: morning offering, evening examen, lament, discernment,
church-day lookback and memorial rollup. The server exposes each one as an MCP
resource and through the `load_skill` tool, so the assistant takes on the
practice's shape before running it.

That is the whole surface: one setup, an email, a conversation. Everything
written lands in your calendar; joshua421 keeps only *that* you reflected, and
your grounding, by your choice.

## Run it

- **`npm run setup`**: the one guided path. It creates `.env`, walks you
  through a free Google OAuth client, mints your token, proves each pipe, and
  connects your assistant. [docs/setup.md](./docs/setup.md) is the
  click-by-click, including the two gotchas: the 7-day token trap and
  connecting Claude Desktop.
- `npm run doctor`: re-check every pipe, read-only, any time something looks off.
- `npm run worker:install`: run the daily nudges in the background (macOS
  launchd). `npm run worker` runs them in the foreground instead;
  `worker:status` and `worker:uninstall` manage the agents.
- `npm run auth`: re-run Google consent and write a fresh refresh token, for
  when a token expires or is revoked.
- `npm run migrate`: one-time, for pre-cutover installs. It moves the old local
  log and grounding file into your calendar.

Config lives in `.env` (see `.env.example`): your Google OAuth and calendar
choices, and `JOSHUA421_LINK_BASE`, the https page the email's Claude link goes
through. Gmail refuses to carry a raw `claude://` link, so the default is the
project's own [bounce page](https://kennie12345.github.io/joshua421/go/),
served from `docs/go/` on GitHub Pages. The prompt travels in the URL fragment,
so that page never sees your day. docs/setup.md, "Why the link goes via a web
page", has the details.

## Develop

```bash
npm install
npm test            # node:test over src/**/*.test.ts, TZ=UTC
npm run typecheck
npm run build
npm run dev         # worker in watch mode
npm run skills:build  # re-stamp the shared centre into skills/*/SKILL.md
```

`.mcp.json` connects joshua421 to Claude Code sessions started in this repo.

## How the repo is organised

```
src/
  core/         the pure engine: ports (Mailer · Diary · Log · Grounding ·
                Journal), flows, cadence, persona; no I/O
  adapters/     the impure edges: Google (calendar + Gmail send-only), the
                Journal-backed Log and Grounding (the calendar as database),
                legacy SQLite/file adapters kept as migration sources
  setup/        the guided path: setup wizard, OAuth flow, .env writer,
                one-time migration, worker installer, path helpers
  mcp.ts        entrypoint: the stdio MCP server your LLM calls
  worker.ts     entrypoint: the scheduled nudge emails
  prod-deps.ts  the one production wiring of ports to adapters
  env.ts        resolves .env and paths by file location, never cwd
  testing/      in-memory fakes for the ports
skills/         the six practices as portable SKILL.md files
docs/
  design.md     the vision, promises, architecture, direction
  status.md     built vs. decided vs. planned
  setup.md      click-by-click setup, troubleshooting
  glossary.md   the fixed vocabulary (Diary, Journal, Grounding, Marker, …)
  adr/          decision records: the "why" that must not be re-litigated
  go/           the email's Claude door: an https page that bounces to the
                claude:// scheme, because Gmail deletes non-http hrefs
.mcp.json       connects joshua421 to Claude Code sessions started in this repo
```

The shape follows the design: everything in `core/` is pure and talks only to
ports; everything impure is an adapter; the two entrypoints and `prod-deps.ts`
are the only places wiring happens. Tests live beside the file they test.

## Scope

**Dogfood first:** me, my own tokens, no account system. Self-hosting is open
to anyone today. `npm run setup` has every user bring their **own** free Google
OAuth client and hold their own tokens, so no one, this project included, ever
holds them. A *hosted* service (us holding tokens: custody, minimal scopes,
verification) is a deliberate, later step. See
[docs/status.md](./docs/status.md) for where the build is.

## License & use

joshua421 is a gift: **free for noncommercial use**, including individuals;
personal, study, and hobby use; religious observance; and any charitable,
educational, research, health, or government organization, regardless of
funding. **Commercial use requires written permission**, so please get in
touch.

Licensed under the **PolyForm Noncommercial License 1.0.0**. See
[LICENSE](./LICENSE) and [NOTICE](./NOTICE). If you build on or share it, keep
the licence and the `Required Notice` with it. *(Plain intent, not legal
advice; the LICENSE text governs.)*
