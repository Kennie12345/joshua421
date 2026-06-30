# joshua421 — design

> "When your children ask in time to come, 'What do these stones mean?'
> then you shall let your children know..." — **Joshua 4:21–22**

In Joshua 4, Israel crosses the Jordan and piles twelve stones into a memorial,
so that later — when the question comes — the story of God's faithfulness gets
retold. That memory, carried into the rhythm of a life, is the spirit of this
project. (We keep the spirit, not the literal "stone/cairn" labels.)

## What it is (one sentence)

**joshua421 calls your LLM to help you reflect on your day and set it up for the
Lord — and writes that into your diary (your calendar's notes today; habit,
notes, and reminder apps later) so it actually shapes the day, not just your
inbox.**

## What it is not

- **Not a devotional.** It doesn't hand you a reflection to read passively. *You*
  reflect, actively, with your LLM; the value is the change it makes to your day.
- **Not a habit-tracker with a cross on it.** The point is God's faithfulness
  shaping the day, never streak-shaming.

## The loop

1. An **email** reminds you — sets up the morning, summarises the evening.
2. You open **your LLM** (Claude / ChatGPT / …); a link prefills the conversation.
3. The LLM helps you **reflect on the day and set it up for the Lord**, drawing on
   your preferences and the day itself.
4. With your **approval**, it does CRUD on your **diary** (calendar) — writing
   gentle, specific notes that orient the day toward God.
5. joshua421 records *that* you reflected (behaviour only) — so you can look back
   and see how faithful God has been.

The reflection **is** the conversation (path A — your LLM does the thinking).
joshua421 is the tools, the memory, and the write-surface.

## Context signals (what makes it thoughtful, not generic)

The setup/reflection draws on whatever is available, and assembles every signal
into the prompt — so new signals slot in without re-architecting:

- **Orientation** — objectives, goals, language, tone (your preferences)
- **Regularity / weekly rhythm** — day-aware
- **Day of week** — weekday / weekend / sabbath
- **Church day + time** → the post-church prompt: *"what did you take from church,
  and how do you want it to shape the week?"*
- **A daily devotional / quiet-time slot** (if they keep one) → the natural home
  and time for the day's reflection; anchor the prompt and the notes to it.
- **Yesterday's end-of-day summary** — continuity, read back from the calendar
- **Today's calendar events**

## The diary (the surface we modify)

- **Calendar today**; habit trackers, notes apps, reminder apps later — each a new
  adapter behind one `Diary` interface.
- **Two write modes, your choice per entry:**
  - write the note **into the entry's notes**, or
  - a separate **private side-entry in the same time slot** — preferred when the
    event has other attendees, so your reflection never appears on a shared invite.
- **Full CRUD** from the conversation. **Every write is approved in the chat**
  before it happens. **Delete is limited to entries joshua421 created** — it never
  touches your real meetings.

## Emails (the nudge, with substance)

Two emails; cadence set by your *regularity* preference (default: morning setup +
evening summary):

- **Morning** — sets you up for the day, drawing on yesterday's end-of-day
  summary, the weekday, and church.
- **Evening** — summarises the day; the summary is written as that day's **calendar
  entry** (the diary is the single source of truth — we don't store it separately).

Both point you to your LLM to do the actual shaping.

## Preferences / orientation

A local, user-owned capture (editable by hand) of **objectives, goals, language,
tone, regularity, church day/time**, and any rhythm that helps. It grounds both
the diary entries and the conversation. This is the **one** piece of content
joshua421 stores — by your explicit choice — because grounding requires memory.

## Promises (invariants)

1. **Behaviour, not content** — the log holds only dates/kinds/status; your
   reflection and diary content are read live and discarded. Preferences are the
   single, opt-in exception.
2. **Additive** — notes are added alongside your words; never rewriting or
   deleting them.
3. **Permission at the boundary** — nothing is written without your approval, in
   the chat.
4. **Grace, not guilt** — gaps met with grace; a memorial to God's faithfulness,
   not a scorecard.

## Architecture

- Pure `core/` engine behind ports: **ReadSource, Reflect, Notify, Mailer, Diary,
  Log, Preferences**.
- Two entrypoints: `mcp.ts` (interactive — your LLM calls the tools) and
  `worker.ts` (scheduled — the emails).
- Adapters: **Google Workspace** (calendar read/write, Gmail send-only), the
  **Claude reflector** (Opus 4.8), a **SQLite** log, **file-backed** preferences.
- `env.ts` resolves `.env` and paths by **file location, not cwd** (MCP hosts
  spawn with an unpredictable working directory).
- The **`Diary` port is the "surface we modify"** seam — future surfaces are new
  adapters, no core reshape.

## The calendar as the database (leading direction)

A realisation worth banking: **the user's calendar can be the database.** Their
calendar already holds the day; it can also hold everything joshua421 needs — the
day summaries (already calendar entries), the behavioural history (a reflection
happened on a day ⇒ there's an entry for it), and even the preferences (a single
dedicated event whose description the user can edit by hand). A dedicated secondary
"joshua421" calendar keeps that bookkeeping out of the way and easy to hide.

Why it's compelling:
- **Total data ownership** — everything lives in the user's calendar; joshua421
  stores *nothing*. "We never store your content" becomes "we store nothing at all."
- **No per-user database to host** — the biggest blocker to the multi-user / hosted
  path disappears; you only ever need calendar access.
- **"Look back" is just their calendar** — scrolling it *is* the memorial.

Tradeoffs: calendars aren't built for querying or structured data (we'd encode a
little state in event descriptions), and there are API rate limits — both fine at
human scale. If adopted, this **replaces the SQLite `Log` and the file-backed
preferences** with calendar reads/writes — most likely behind the *same* `Log` /
`Preferences` ports, so the engine doesn't change, only the adapter.

### Consuming it over time (the long game)

The deep value is **longitudinal**: over months, seasons, years, decades the
entries become *evidence* of God's good work — privately held in the person's own
calendar. Reading a day / week / month back is just a date-range query. Reading a
year or a decade by re-scanning every entry would be heavy — so the design is
**hierarchical rollups**: daily summaries distil into a weekly, weeklies into a
monthly, months into a season / year — each written as its own calendar entry. A
look-back at any horizon reads only the rollups at that level, so consumption stays
bounded no matter how many years accumulate.

Two things make the calendar genuinely queryable as a store:
- **`extendedProperties`** on each entry — Google Calendar's private metadata
  (type, level, date), filterable via `privateExtendedProperty` on `events.list`,
  so we can fetch "all monthly summaries" without scanning everything;
- time-range queries (`timeMin` / `timeMax`).

The rollups aren't only a performance workaround — they **are** a headline artifact
("your year with God," "this season"): the technical answer and the deepest feature
turn out to be the same thing.

## Where it runs (today → future)

- **Today:** your own LLM. In **Claude Desktop**, joshua421's tools are connected,
  so the full loop (reflect → write the diary) works there.
- The email's **web links** open claude.ai / chatgpt.com — they give the
  *reflection*, but those web apps don't have joshua421's local tools, so they
  **can't write the diary**. Desktop is where the writing happens now.
- **Future:** our **website with an embedded LLM + the tools together**, so the
  email link lands somewhere that can actually modify the diary — for anyone. That
  is the hosted step.

## Scope

**Dogfood first** — Kenneth, own tokens, no account system. Onboarding anyone else
means holding *their* Google OAuth token (their whole calendar/inbox) — token
custody and minimal scopes become first-class work, a hard tripwire, not
refactor-later.

## Status — built vs. planned

**Built today:**
- core engine (`Note` / `Reflection` / `Log`), Google + Claude + SQLite adapters,
  `env.ts`
- MCP: `read_day`, `apply_day_notes` (additive annotate + day summary),
  `get_grounding` / `set_grounding`, plus the older `reflect_on_day` / `look_back`
  / `prepare_for_event` (finished-reflection email tools)
- worker: two daily emails grounded in goals, with Claude/ChatGPT links; launchd
  agents (`com.joshua421.morning` 07:00, `com.joshua421.evening` 20:00)

**Planned (in order):**
1. **Preferences** — expand grounding to objectives / goals / language / tone /
   regularity / church day-time; add day-of-week and yesterday's-summary signals.
2. **Privacy-aware diary CRUD** — write-in-place *or* side-entry; full CRUD; every
   write approved in chat; delete limited to joshua421-created entries.
3. **Emails reworked** — morning *setup* (using yesterday's summary + weekday +
   church) and evening *summary* (stored in the calendar); prune the
   devotional-only finished-reflection tools.
4. **Storage** — evaluate moving the `Log` and preferences into the calendar
   itself (the *calendar as the database* direction above), behind the same ports.
5. **Later** — more surfaces (habit / notes / reminder apps); the hosted website
   with an embedded LLM.
