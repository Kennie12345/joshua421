# joshua421

> "When your children ask in time to come, 'What do these stones mean?'
> then you shall let your children know..." — **Joshua 4:21–22**

In Joshua 4, Israel crosses the Jordan and piles twelve stones into a memorial,
so that later — when the question comes — the story of God's faithfulness gets
retold. That memory, carried into the rhythm of a life, is the spirit of this
project.

## What it is

**joshua421 calls your LLM to help you reflect on your day and set it up for the
Lord — and writes that into your diary (your calendar's notes today; habit, notes,
and reminder apps later) so it shapes the day, not just your inbox.**

It is *not* a devotional you read passively. *You* reflect, actively, with your own
LLM (Claude, ChatGPT, …); joshua421 is the tools, the memory, and the write-surface
that turn the reflection into gentle, specific notes — placed right in your day.

→ See **[DESIGN.md](./DESIGN.md)** for the full vision, the context signals, the
privacy model, the calendar-as-database direction, and the roadmap (built vs planned).

## The loop

1. An **email** reminds you — sets up the morning, summarises the evening.
2. You open **your LLM**; a link prefills the conversation.
3. It helps you reflect and **set the day up for the Lord**, grounded in your goals
   and the day.
4. With your **approval**, it writes notes into your calendar.
5. joshua421 records *that* you reflected — never *what* you said.

## Promises

1. **Behaviour, not content** — the log holds only dates/kinds/status; your
   reflection and diary content are read live and discarded. Your goals/preferences
   are the single, opt-in exception you choose to store.
2. **Additive** — notes are added alongside your words; never rewriting or deleting.
3. **Permission at the boundary** — nothing is written without your approval, in chat.
4. **Grace, not guilt** — gaps met with grace; a memorial to God's faithfulness, not
   a scorecard.

## Architecture (one breath)

A TypeScript **core engine** behind ports (Mailer · Diary · Log · Preferences ·
Journal), with two entrypoints — an **MCP** your LLM calls, and a scheduled
**worker** for the emails. Adapters: **Google Workspace** (calendar read/write,
Gmail send-only), a **SQLite** log, **file-backed** preferences. The **`Diary`
port is the "surface we modify"** — calendar today, more apps later as new
adapters. *(The calendar may become the single store — see DESIGN.md.)*

**Provider-agnostic by design:** joshua421 makes no model calls of its own. The
reflecting happens in *your* assistant — Claude Desktop, ChatGPT, a local LLM, any
MCP-capable client — so you bring whichever provider you like. joshua421 is just
tools, a persona, and a write-surface.

## Run it

- `npm run auth` — one-time Google OAuth to mint your refresh token.
- `npm run mcp` — the stdio MCP server (connect it in Claude Desktop / Claude Code).
- `npm run worker` — the scheduled emails (or the launchd agents in
  `~/Library/LaunchAgents/com.joshua421.*`).

Config lives in `.env` (see `.env.example`): your Google OAuth and local paths —
no LLM key, since joshua421 calls no model itself. Current state vs. roadmap:
**DESIGN.md → Status**.

## Scope

**Dogfood first** — me, my own tokens, no account system. Onboarding others (their
token custody, minimal scopes, hosting) is a deliberate, later step.

## License & use

joshua421 is a gift: **free for noncommercial use** — individuals; personal, study,
and hobby use; religious observance; and any charitable, educational, research,
health, or government organization, regardless of funding.

**Commercial use requires written permission.** If you'd like to use joshua421
commercially, please get in touch to arrange terms.

Licensed under the **PolyForm Noncommercial License 1.0.0** — see [LICENSE](./LICENSE)
and [NOTICE](./NOTICE). If you build on or share it, keep the licence and the
`Required Notice` with it. *(Plain intent, not legal advice; the LICENSE text governs.)*
