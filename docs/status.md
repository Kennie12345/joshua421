# Status — built vs. planned

The vision is [design.md](./design.md); this page tracks the build against it.

## Built

- **Core engine** behind ports (`Reflection` / `Log`), Google + SQLite
  adapters, file-location `env.ts`.
- **Provider-agnostic** — no LLM calls of its own; the user's assistant reads
  the companion persona (`core/persona.ts`, shipped as the server's
  `instructions`, with `FIXED_CENTRE` reasserted in the tool descriptions) and
  calls the tools.
- **MCP tools** — `read_day`, `apply_day_notes` (additive annotate + day
  summary; refuses to annotate a *shared* event in place — a shared note would
  sync to every attendee), `get_grounding` / `set_grounding`.
- **Worker** — two daily nudge emails with two ways in: deep links (a
  `claude://` link into Claude Desktop, where the MCP is present to write the
  diary, plus a ChatGPT reflect-only link) and a paste path of two date-rotated
  questions the user answers and pastes into any assistant. HTML twin included;
  event times render in the calendar's own wall-clock, never bare UTC.
- **Cadence that breathes** (`core/cadence.ts`) — nudges follow the person, not
  the clock. Rhythm is parsed from grounding (`Rhythm:` / `Church:` lines);
  silence is read from the Log (days since the last reflection — never
  email-open tracking). A short gap gets a gentle welcome-back; a long silence
  falls back to a weekly touch on the church/anchor day; an already-reflected
  day is softened, not skipped; the church day is never suppressed. Grace, not
  guilt — asserted by test. (launchd owns the *time* of day; cadence owns the
  days, kinds, and tone.)
- **Grounding** — a freeform doc (goals, tone & language, rhythm, church
  day/time, quiet-time slot); the live persona reads it and calibrates tone and
  directness.
- **Journal** — the calendar-as-database seam (`core/journal.ts` port +
  `adapters/journal-google.ts`: typed, tagged, queryable; verified live).
  Re-cut **upsert-only** per ADR 0005: one entry per kind + period, paginated
  reads, tz-immune day windows, legacy adoption and duplicate healing. Diary is
  now read + annotate only; `prod-deps.ts` assembles the one production graph.
- **Onboarding** — `npm run setup` ([setup.md](./setup.md)): bootstraps `.env`
  (`0600`), walks the Google Cloud steps, mints and writes the token, autofills
  the email from it, smoke-tests each pipe, generates the `bin/joshua421-mcp`
  launcher and wires Claude Desktop (config backed up first). Rerunnable and
  EOF-safe. `npm run doctor` re-checks every pipe read-only. A welcome email
  carries the induction; a first-visit signal (empty grounding) lets the
  companion offer setup on the natural path.
- **Worker installer** — `npm run worker:install` / `:uninstall` / `:status`
  generate and load the launchd agents (07:00 / 20:00); foreground
  `npm run worker` is the non-macOS fallback.

## Decided

- **Store calendar** — `JOSHUA421_CALENDAR_ID`: a dedicated calendar or
  primary, the user's choice; default primary.
- **Behavioural record** — an **empty-body Marker** entry per reflected day
  (keeps the no-content guarantee structural).
- **Raw content** — the calendar holds everything, including the rawest
  reflection; privacy wording stays honest about calendar exposure (Promise 1).
- **Grounding** — a local file for now, behind the port; migrates to a calendar
  entry at the Journal cutover.

## Planned — MCP / self-host

1. **Invariant tests** — in-memory Journal + fake Log + an anchor test:
   recording "a reflection happened" yields an *empty-body* entry; content only
   ever flows the content path. Written *before* the Log cutover, because the
   cutover trades a structural guarantee for a disciplinary one.
2. **Private surface + delete guard** — route the active `Diary` off `primary`
   (honour `JOSHUA421_CALENDAR_ID`); guard `delete()` to `joshua421=true`
   entries (today it's unguarded — a prompt-injection →
   real-meeting-deletion risk).
3. **Cadence — remaining** — a true one-tap "less often" link (needs a web
   endpoint; waits for the hosted tier — today it routes through the assistant
   via `set_grounding`); the post-church prompt at full weight on the church
   day; the church day as the hook the weekly rollup hangs off.
4. **Scriptural spine + an exit off the screen** — anchor reflection to the
   Word, **non-denominationally**: no reading plan or translation imposed, no
   Scripture text embedded or stored. The Word enters through the
   *conversation*; if the person keeps a reading plan it lives in their
   grounding, otherwise the companion lets a passage meet the day — and
   **points them to read it** (a link, their own Bible) rather than reproducing
   the text, which meets the Word at the source, sidesteps translation
   copyright, and guards against misquoting. End each reflection handing off to
   prayer, stillness, and a named human. Prompt work; no engine reshape.
5. **Privacy-aware diary CRUD** — write-in-place *or* side-entry; full CRUD;
   every write approved in chat; delete limited to joshua421-created entries.
6. **Make the memorial *felt* + rollups** — wire the already-written
   `look-back` prompt + `Log.streak()` into a recurring "look how faithful God
   has been" digest; the morning email reads back yesterday's summary; add the
   daily → weekly → monthly → season rollup jobs. Watch the knife-edge:
   presence-as-grace, never a scorecard-with-a-cross.
7. **Cut `Log` + `Grounding` over to the Journal** — storage becomes the
   calendar, behind the same ports (keystone already built).
8. **BYO-OAuth / self-host template** — a second user brings their own Google
   OAuth and holds their own tokens; the service never holds a raw refresh
   token. The un-gated route to real user #2.

**Later:** more surfaces (habit / notes / reminder apps) — each a new `Diary`
adapter.

**Paid / hosted — tracked privately, not in this repo:** the hosted web app
that closes the write loop for non-technical users. See the gitignored
`*.notes.md`.
