# joshua421 — design

> "When your children ask in time to come, 'What do these stones mean?'
> then you shall let your children know..." — **Joshua 4:21–22**

In Joshua 4, Israel crosses the Jordan and piles twelve stones into a memorial,
so that later — when the question comes — the story of God's faithfulness gets
retold. That memory, carried into the rhythm of a life, is the spirit of this
project.

*The vocabulary (Diary, Journal, Grounding, Marker, …) is fixed in
[glossary.md](./glossary.md). Settled decisions live in [adr/](./adr/).
Built vs. planned lives in [status.md](./status.md).*

## What it is

**joshua421 calls your LLM to help you reflect on your day and set it up for the
Lord — and writes that into your diary (your calendar's notes today; habit,
notes, and reminder apps later) so it shapes the day, not just your inbox.**

It is *not* a devotional — you reflect, actively, with your own LLM; the value is
the change it makes to your day. And it is *not* a habit-tracker with a cross on
it — the point is God's faithfulness shaping the day, never streak-shaming.

## The loop

1. An **email** reminds you — sets up the morning, summarises the evening.
2. You open **your LLM** (Claude / ChatGPT / …); a link prefills the conversation.
3. It helps you **reflect and set the day up for the Lord**, drawing on your
   grounding and the day itself.
4. With your **approval**, it does CRUD on your **diary** (calendar) — gentle,
   specific notes that orient the day toward God.
5. joshua421 records *that* you reflected (behaviour only) — so you can look back
   and see how faithful God has been.

The reflection **is** the conversation; joshua421 is the tools, the memory, and
the write-surface.

## Context signals

Every available signal is assembled into the prompt, so new ones slot in without
re-architecting: orientation (goals, language, tone) · weekly rhythm and day of
week · church day + time (→ the post-church prompt: *"what did you take from
church, and how do you want it to shape the week?"*) · a quiet-time slot, if they
keep one · yesterday's end-of-day summary · today's calendar events.

## The diary (the surface we modify)

- **Calendar today**; habit trackers, notes and reminder apps later — each a new
  adapter behind the one `Diary` port.
- **Two write modes, chosen per entry:** into the entry's notes, or a private
  side-entry in the same time slot — preferred when the event has other
  attendees, so a reflection never lands on a shared invite.
- **Full CRUD** from the conversation; **every write approved in chat**;
  **delete limited to entries joshua421 created** — it never touches your real
  meetings.

## Emails

Two nudges (default: morning setup + evening summary), cadence set by your
rhythm. The evening summary is written as that day's **calendar entry** — the
diary is the single source of truth; nothing is stored separately. Both point
you to your LLM to do the actual shaping.

## Grounding

A user-owned capture of goals, language, tone, rhythm, church day/time — one
entry in your own calendar, still editable by hand (the entry's description
*is* the document). It grounds both the diary entries and the conversation —
the **one** piece of content joshua421 keeps, by your explicit choice, because
grounding requires memory.

## Promises (invariants)

1. **Behaviour, not content** — joshua421's own log holds only
   dates/kinds/status. Reflections and notes live in *your* calendar — which
   syncs, exports to ICS, and is readable by every calendar-scoped app per
   *your* Google settings. So the honest claim is **"we store nothing of
   yours,"** never "your content is encrypted or app-scoped": calendar fields
   are exactly as private as your calendar is. (Grounding is the single opt-in
   exception.)
2. **Additive** — notes are added alongside your words; never rewriting or
   deleting them.
3. **Permission at the boundary** — nothing is written without your approval,
   in the chat.
4. **Grace, not guilt** — gaps met with grace; a memorial to God's faithfulness,
   not a scorecard.

## Architecture

- A pure `core/` engine behind ports: **Mailer, Diary, Log, Grounding, Journal**.
- Two entrypoints: `mcp.ts` (interactive — your LLM calls the tools) and
  `worker.ts` (scheduled — the emails).
- Adapters: **Google Workspace** (calendar read/write, Gmail send-only); the
  Log and the Grounding are **Journal-backed** — uses of the calendar-as-database
  seam, not stores of their own. (The legacy SQLite/file adapters remain only as
  `npm run migrate` sources.)
- **OAuth scopes**, minimal and disclosed: `calendar.events`, `gmail.send`
  (send — never *read* — mail), and identity-only `openid`/`email`, which grants
  no data access and only lets the token report which account authorised it.
- `env.ts` resolves `.env` and paths by **file location, not cwd** (MCP hosts
  spawn with an unpredictable working directory). `.env` is written `0600`.
- The **`Diary` port is the "surface we modify"** seam — future surfaces are new
  adapters, no core reshape.

### Provider-agnostic (no model of our own)

joshua421 **makes no LLM calls of its own.** The reflecting happens in *your*
assistant — any MCP-capable client — which reads the companion persona
(`core/persona.ts`, shipped as the server's `instructions`) and calls the tools.
The worker's emails are pure templating, not model output.

The one future exception is **headless rollups** (scheduled summaries with no
assistant present). When built, that is a small summariser port with a
configurable OpenAI-compatible adapter (base-URL + model) — the user points it
at whatever they run; no vendor SDK baked in.

## The calendar as the database

**The user's calendar IS the database** (cut over — see status.md). It already
holds the day; it holds everything joshua421 needs — the day summaries, the
behavioural record (a Marker per reflected day), even the grounding (one
dedicated entry the user can edit by hand). Why it's compelling:

- **Total data ownership** — "we never store your content" becomes "we store
  nothing at all."
- **No per-user database to host** — the biggest blocker to a multi-user path
  disappears; only calendar access is ever needed.
- **"Look back" is just their calendar** — scrolling it *is* the memorial.

The tradeoffs — calendars are poor at structured data, and there are rate
limits — are accepted, not regretted (see ADR 0003: the calendar is the
*subject*, not the store). A little state is encoded in `extendedProperties`
(filterable via `privateExtendedProperty`), and time-range queries do the rest.
The cutover replaced the SQLite `Log` and file-backed grounding behind the
*same* ports — only the adapters changed; `npm run migrate` carries a
pre-cutover machine across once.

### Rollups (consuming it over time)

The deep value is longitudinal: over years the entries become *evidence* of
God's good work. Re-scanning a decade would be heavy, so summaries roll up
hierarchically — days → week → month → season / year, each written as its own
calendar entry — and a look-back at any horizon reads only that level. The
rollups aren't just the performance answer; they **are** the headline artifact
("your year with God").

### Significant moments & media

Not every day is equal. A landmark is flagged **significant** via
`extendedProperties` (set in conversation — "this was a big one"), and rollups
lead with the landmarks rather than an even wash of days. Photos and videos
stay in the user's **Drive**; calendar entries *reference* them via attachments
— the calendar stays the index, Drive holds the blobs, joshua421 still stores
nothing. (Two honest notes: this needs a `drive.file` scope, and having the LLM
*see* the media is a further step beyond referencing it. The layer sits on top
without reshaping ports.)

## Where it runs

Today: your own LLM. In **Claude Desktop** the tools are connected, so the full
loop (reflect → write the diary) works. The email's web links open claude.ai /
chatgpt.com — they give the *reflection*, but have no local tools, so they
can't write the diary. Desktop is where the writing happens now.

This repo is the **MCP / self-host build** — free, open, built first. A hosted
web app that closes the write loop for non-technical users is a separate
**paid** direction, tracked privately outside this repo (the gitignored
`*.notes.md`).

## Scope

**Dogfood first** — Kenneth, own tokens, no account system. A second self-host
user brings their **own** Google OAuth, so we never hold their tokens. The
moment *we* hold anyone's token — the hosted paid tier — is a hard tripwire:
token custody, minimal scopes, OAuth verification, breach liability become
first-class work, not refactor-later. That work lives with the paid/hosted
notes, not here.
