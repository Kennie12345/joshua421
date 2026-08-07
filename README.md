# joshua421

> "When your children ask in time to come, 'What do these stones mean?'
> then you shall let your children know..." — **Joshua 4:21–22**

In Joshua 4, Israel crosses the Jordan and piles twelve stones into a memorial,
so that later — when the question comes — the story of God's faithfulness gets
retold. That memory, carried into the rhythm of a life, is the spirit of this
project.

## What it is

**joshua421 calls your LLM to help you reflect on your day and set it up for
the Lord — and writes that into your diary (your calendar's notes today) so it
shapes the day, not just your inbox.**

It is *not* a devotional you read passively. *You* reflect, actively, with your
own LLM (Claude, ChatGPT, …); joshua421 is the tools, the memory, and the
write-surface. The loop: an **email** nudges you → a link opens **your LLM** →
it helps you reflect and set the day up for the Lord → with your **approval**
it writes notes into your calendar → joshua421 records *that* you reflected,
never *what* you said.

Four promises: **behaviour, not content** (a reflected day is one empty Marker
entry in *your* calendar — joshua421 itself stores nothing at all; your
grounding is the one piece of content kept, also in your calendar, by your
choice) · **additive** (never rewriting or deleting your words) · **permission
at the boundary** (nothing written without your approval, in chat) · **grace,
not guilt** (a memorial to God's faithfulness, not a scorecard).

joshua421 makes **no model calls of its own** — you bring whichever assistant
you like, so no LLM key is needed. → [docs/design.md](./docs/design.md) has the
full vision and privacy model.

## Run it

- **`npm run setup`** — the one guided path: creates `.env`, walks you through
  a free Google OAuth client, mints your token, proves each pipe, and connects
  your assistant. [docs/setup.md](./docs/setup.md) is the click-by-click (and
  the two gotchas — the 7-day token trap and connecting Claude Desktop).
- `npm run doctor` — re-check every pipe, read-only, any time something looks off.
- `npm run worker:install` — run the daily nudges in the background (macOS
  launchd); `npm run worker` runs them in the foreground instead.
- `npm run migrate` — one-time, for pre-cutover installs: moves the old local
  log and grounding file into your calendar.

Config lives in `.env` (see `.env.example`): your Google OAuth and calendar
choices, and `JOSHUA421_LINK_BASE` — the https page the email's Claude link goes
through (Gmail refuses to carry a raw `claude://` link; docs/setup.md → "Why the
link goes via a web page").

## How the repo is organised

```
src/
  core/         the pure engine — ports (Mailer · Diary · Log · Grounding ·
                Journal), flows, cadence, persona; no I/O
  adapters/     the impure edges — Google (calendar + Gmail send-only), the
                Journal-backed Log and Grounding (the calendar as database),
                legacy SQLite/file adapters kept as migration sources
  setup/        the guided path — setup wizard, OAuth flow, .env writer,
                one-time migration, worker installer, path helpers
  mcp.ts        entrypoint: the stdio MCP server your LLM calls
  worker.ts     entrypoint: the scheduled nudge emails
  prod-deps.ts  the one production wiring of ports → adapters
  env.ts        resolves .env and paths by file location, never cwd
  testing/      in-memory fakes for the ports
docs/
  design.md     the vision, promises, architecture, direction
  status.md     built vs. decided vs. planned
  setup.md      click-by-click setup, troubleshooting
  glossary.md   the fixed vocabulary (Diary, Journal, Grounding, Marker, …)
  adr/          decision records — the "why" that must not be re-litigated
  go/           the email's Claude door: an https page that bounces to the
                claude:// scheme, because Gmail deletes non-http hrefs
.mcp.json       connects joshua421 to Claude Code sessions started in this repo
```

The shape follows the design: everything in `core/` is pure and talks only to
ports; everything impure is an adapter; the two entrypoints and `prod-deps.ts`
are the only places wiring happens. Tests live beside the file they test.

## Scope

**Dogfood first** — me, my own tokens, no account system. Self-hosting is open
to anyone today: `npm run setup` has every user bring their **own** free Google
OAuth client and hold their own tokens, so no one — this project included —
ever holds them. A *hosted* service (us holding tokens: custody, minimal
scopes, verification) is a deliberate, later step — see
[docs/status.md](./docs/status.md) for where the build is.

## License & use

joshua421 is a gift: **free for noncommercial use** — individuals; personal,
study, and hobby use; religious observance; and any charitable, educational,
research, health, or government organization, regardless of funding.
**Commercial use requires written permission** — please get in touch.

Licensed under the **PolyForm Noncommercial License 1.0.0** — see
[LICENSE](./LICENSE) and [NOTICE](./NOTICE). If you build on or share it, keep
the licence and the `Required Notice` with it. *(Plain intent, not legal
advice; the LICENSE text governs.)*
