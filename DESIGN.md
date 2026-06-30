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

1. **Behaviour, not content** — joshua421's own log holds only dates/kinds/status.
   Your reflections and diary notes live in *your* calendar, which syncs, exports
   to ICS, and is readable by every calendar-scoped app per *your* Google
   settings — joshua421 stores none of it itself. So the honest claim is **"we
   store nothing of yours,"** never "your content is encrypted or app-scoped":
   calendar fields are exactly as private as your calendar is. (Preferences are
   the single piece it does keep, by your choice.)
2. **Additive** — notes are added alongside your words; never rewriting or
   deleting them.
3. **Permission at the boundary** — nothing is written without your approval, in
   the chat.
4. **Grace, not guilt** — gaps met with grace; a memorial to God's faithfulness,
   not a scorecard.

## Architecture

- Pure `core/` engine behind ports: **Reflect, Mailer, Diary, Log, Preferences**,
  and the **Journal** store (calendar-as-database).
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

### Significant moments & media

Not every day is equal. Some are landmarks — so mark them. A moment is flagged
**significant** via `extendedProperties` (set in the conversation — "this was a big
one"), and the rollups **surface the period's significant moments first**, so a
year / decade look-back leads with the landmarks rather than an even wash of days.

Rich media rides the same rails: photos and videos live in the user's **Drive**
(their own storage), and the calendar entry **references** them via Calendar
**attachments** (Drive file links). The calendar stays the index — references, tags,
summaries — while Drive holds the blobs; joshua421 still stores nothing. So "your
year with God" can lead with the actual moments, photos attached.

Two honest notes: this needs a **Drive scope** (a new permission beyond calendar +
send-only Gmail), and having the LLM *see* an image to write about it (vision) is a
further step beyond merely *referencing* it — a later enhancement. The whole layer
sits on top of calendar-as-database without changing the ports or the engine: the
`Diary` adapter gains "attach" and "mark significant," and rollups filter by the
significance tag.

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
- MCP: `read_day`, `apply_day_notes` (additive annotate + day summary; refuses to
  annotate a *shared* event in place — a shared note would sync to every attendee),
  `get_grounding` / `set_grounding`
- worker: two daily emails grounded in preferences, with Claude/ChatGPT links;
  launchd agents (`com.joshua421.morning` 07:00, `com.joshua421.evening` 20:00)
- **Preferences** — grounding broadened to a freeform doc (goals, tone & language,
  rhythm, church day/time, quiet-time slot); morning/evening prompts honour tone
  and the day's shape; the day-of-week signal flows into the email context
- **Journal** — the calendar-as-database store seam (`core/journal.ts` port +
  `journal-google.ts` Google adapter: typed, tagged, queryable; verified live)

**Decisions (settled):**
- **Store calendar** — configurable via `JOSHUA421_CALENDAR_ID` (dedicated
  "joshua421" calendar *or* primary; the user chooses per their setup). Default
  primary.
- **Behavioural record** — a separate **empty-body marker** entry per reflected
  day (keeps the no-content guarantee structural; marks any day with a reflection).
- **Raw content** — the calendar holds everything, including the rawest
  reflection; privacy wording is honest about calendar exposure (see Promise 1).
- **Preferences** — a local file **for now** (ships present value, behind the
  `Preferences` port); migrates to a calendar entry at the Journal cutover.

**Planned (in order):**
1. **Invariant tests** *(the gate)* — in-memory Journal + fake Log + an anchor
   test: recording "a reflection happened" yields an *empty-body* entry; content
   only ever flows the content path. Written *before* the seam re-cut, because the
   cutover trades a structural guarantee (the Log has no content column) for a
   disciplinary one (markers and content share one Journal `add`).
2. **Re-cut the seam** — `writeSummary` → Journal (marked `joshua421=true` on the
   store calendar); `Diary` shrinks to read + in-place annotate; side-entries
   become Journal entries; idempotent `upsert(kind, periodKey, entry)`; delete
   guarded to `joshua421=true`; pagination (the 2500-cap bug), tz-immune day
   windows, read-after-write by id.
3. **Privacy-aware diary CRUD** — write-in-place *or* side-entry; full CRUD; every
   write approved in chat; delete limited to joshua421-created entries.
4. **Emails reworked** — morning *setup* (now also using yesterday's summary, read
   back from the Journal) and evening *summary* (stored in the calendar).
5. **Cut `Log` + `Preferences` over to the Journal** (keystone built) and add the
   rollup jobs — storage becomes the calendar, behind the same ports.
6. **Later** — more surfaces (habit / notes / reminder apps); the hosted website
   with an embedded LLM.
