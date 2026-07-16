# Status — built vs. planned

The vision is [design.md](./design.md); this page tracks the build against it.

## Built

- **Core engine** behind ports (**Mailer · Diary · Log · Grounding · Journal**),
  assembled once in `prod-deps.ts`.
- **Provider-agnostic** — no LLM calls of its own; the user's assistant reads
  the companion persona (`core/persona.ts`, shipped as the server's
  `instructions`, with `FIXED_CENTRE` reasserted in the tool descriptions) and
  calls the tools.
- **MCP tools** — `read_day` (the day, plus yesterday's kept summary so the
  reflection can continue a thread), `apply_day_notes`, `look_back`,
  `save_rollup`, `undo_write`, `get_grounding` / `set_grounding`.
- **Privacy-aware diary CRUD** — two write modes chosen per entry in chat:
  additive notes into the event, or a **private side-entry** in the same time
  slot (the only mode for shared/public events — a note written into one would
  sync to every attendee; `read_day` marks them `shared`). Every write
  reversible: `undo_write` strips only joshua421's fenced block from the user's
  own event, or deletes a joshua421-**created** entry via the Journal's guarded
  delete — real events are structurally out of reach.
- **The calendar IS the database** — the cutover is done. Markers (reflected
  days, empty-body by construction), day summaries, rollups, side entries and
  the preferences all live in the user's own calendar behind the one Journal
  seam (upsert-only per ADR 0005). No SQLite file, no grounding file, no
  per-user store to ever host: "we store nothing at all." `npm run migrate`
  moves a pre-cutover machine across once (idempotent; never clobbers
  preferences already saved through the conversation).
- **Worker** — two daily nudge emails with two ways in: deep links (a
  `claude://` link into Claude Desktop, where the MCP is present to write the
  diary, plus a ChatGPT reflect-only link) and a paste path of two date-rotated
  questions. HTML twin included; event times render in the calendar's own
  wall-clock, never bare UTC. The **morning email reads back yesterday's kept
  summary** — their own words, the memorial felt daily.
- **Cadence that breathes** (`core/cadence.ts`) — nudges follow the person, not
  the clock. Rhythm is parsed from grounding (`Rhythm:` / `Church:` lines);
  silence is read from the Log (days since the last reflection — never
  email-open tracking). A short gap gets a gentle welcome-back; a long silence
  falls back to a weekly touch on the church/anchor day; an already-reflected
  day is softened, not skipped; the church day is never suppressed. Grace, not
  guilt — asserted by test.
- **The church day carries the week** — on the church evening the nudge arrives
  at full post-church weight: its own frame (what I took from church, and how it
  shapes the week ahead), its own always-welcoming question bank, an honest
  "after church" subject. The week's look-back and rollup hang off it.
- **The memorial, felt** — `look_back` gathers a period's stones (days shown
  up, kept summaries in their own words, existing rollups; ranges computed
  deterministically in `core/rollup.ts` — ISO weeks, months, seasons, years) and
  the assistant weaves "look how faithful God has been" in conversation;
  `save_rollup` keeps an approved distillation as the period's single entry
  ("Your year with God · 2026" is the headline artifact). Presence reads as
  memorial, never scorecard.
- **Scriptural spine + the exit off the screen** — the companion is anchored in
  the Word non-denominationally: no reading plan or translation imposed, a
  passage **pointed to** (a link, their own Bible), never dispensed. Every
  reflection ends in a named send-off — prayer, stillness, or a person the day
  surfaced. The screen is never the destination.
- **Grounding** — the user's freeform preferences doc, now one calendar entry
  they can still edit by hand; the live persona reads it and calibrates tone and
  directness.
- **Onboarding / BYO-OAuth** — `npm run setup` ([setup.md](./setup.md)): every
  user brings their **own** free Google OAuth client and holds their own tokens
  — no one, this project included, ever holds them. Bootstraps `.env` (`0600`),
  walks the Google Cloud steps, mints and writes the token, smoke-tests each
  pipe, offers the one-time migration where needed, generates the
  `bin/joshua421-mcp` launcher and wires Claude Desktop (config backed up
  first). Rerunnable and EOF-safe. `npm run doctor` re-checks every pipe
  read-only. This repo **is** the self-host template — the un-gated route to
  user #2 is open.
- **Worker installer** — `npm run worker:install` / `:uninstall` / `:status`
  generate and load the launchd agents (07:00 / 20:00); foreground
  `npm run worker` is the non-macOS fallback.

## Decided

- **Store calendar** — `JOSHUA421_CALENDAR_ID`: a dedicated calendar or
  primary, the user's choice; default primary.
- **Raw content** — the calendar holds everything, including the rawest
  reflection; privacy wording stays honest about calendar exposure (Promise 1).
- **Rollups are woven in conversation** — the assistant reads the stones and
  the user approves the distillation; joshua421 still calls no model of its own.

## Planned — MCP / self-host

1. **One-tap "less often" link** — needs a web endpoint (Gmail is send-only),
   so it waits for the hosted tier; today it routes through the assistant via
   `set_grounding`.
2. **Headless rollups** — a scheduled rollup with no assistant present is the
   one future server-side LLM need: a small summariser port with a configurable
   OpenAI-compatible adapter (base-URL + model), no vendor SDK baked in. Built
   when actually wanted — the conversation path covers the dogfood.
3. **Significant moments & media** — flag a landmark day in conversation
   (`extendedProperties`), let rollups lead with landmarks; photos/videos stay
   in Drive, referenced not stored (needs a `drive.file` scope when it comes).
4. **User-zone day selection** — the worker's "today" is host-local, correct
   while it runs on the user's own machine (launchd); it must become user-zone
   aware before the worker ever moves to a box in another zone. Documented at
   the boundary in code.

**Later:** more surfaces (habit / notes / reminder apps) — each a new `Diary`
adapter.

**Paid / hosted — tracked privately, not in this repo:** the hosted web app
that closes the write loop for non-technical users. See the gitignored
`*.notes.md`.
