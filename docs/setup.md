# Setting up joshua421

One guided path: **clone → `npm install` → `npm run setup`**. The wizard writes
your credentials into `.env` for you, proves each pipe with a smoke test,
connects your assistant, and offers to send a welcome email. This page is the
click-by-click behind that wizard, plus the two things that bite people.

> **TL;DR:** `npm install && npm run setup`, follow the prompts, restart Claude
> Desktop. If anything looks off later, `npm run doctor` tells you what and why.

---

## What you need

- **Node 20+** and this repo cloned.
- A **Google account** (the one whose calendar you want to reflect into).
- ~10 minutes, once, for a free Google Cloud OAuth client (below). joshua421
  makes you bring **your own** client so that no one — not even this project —
  ever holds your tokens.

You do **not** need an LLM API key. joshua421 makes no model calls of its own;
the reflecting happens in your assistant (Claude Desktop / ChatGPT / any
MCP-capable client).

---

## Step 1 — a Google OAuth client (one time, ~10 min)

The wizard pauses and asks for a **Client ID** and **Client Secret**. Here is how
to mint them. Every link opens the exact Google Cloud page.

1. **Create a project.**
   → <https://console.cloud.google.com/projectcreate>
   Name it anything (e.g. `joshua421`). Create, then make sure it's selected in
   the top bar.

2. **Enable the two APIs it uses.**
   → <https://console.cloud.google.com/apis/library>
   Search **"Google Calendar API"** → Enable. Then search **"Gmail API"** →
   Enable. (Calendar to read/annotate your day; Gmail to *send* — never read —
   your nudge emails.)

3. **Configure the consent screen / audience.**
   → <https://console.cloud.google.com/apis/credentials/consent>
   Choose **External**, fill in the app name and your email where required, and
   add **your own Google account as a Test user**. You can skip the scope
   picker — joshua421 requests its scopes at sign-in.

4. **Create the OAuth client.**
   → <https://console.cloud.google.com/apis/credentials>
   **Create credentials → OAuth client ID → Application type: Desktop app.**
   Name it, Create. A dialog shows your **Client ID** and **Client Secret** —
   keep it open.

5. **Publish the app** (this is the part that saves you a week of grief — see
   *The 7-day trap* below).
   → <https://console.cloud.google.com/apis/credentials/consent>
   **Audience → Publish app → Confirm.** No Google verification is needed for
   your own personal use.

6. Back in the terminal, paste the **Client ID** and **Client Secret** when the
   wizard asks. It writes them into `.env` and moves straight on to
   authorisation — a browser window where you pick your account and click
   **Allow**. Because the app is unverified, Google shows a warning first:
   click **Advanced → Go to \<app name\> (unsafe)**. It's your own app talking to
   your own account; that's exactly what "unsafe" means here.

   The consent screen lists what you're granting: **See/edit calendar events**,
   **Send email on your behalf** (send only — never *read* your inbox), and your
   **basic profile / email address**. That last one grants no data access; it
   only lets the token report which account it is, so setup can fill in your email
   for you. Nothing here can read your mail.

That's the whole one-time cost. The wizard captures the refresh token, fills in
your email from the sign-in, and you never touch `.env` by hand.

### The 7-day trap

While your consent screen is in **"Testing"**, Google **expires the refresh
token after 7 days** — so joshua421 works for a week and then silently stops,
which is the most confusing possible failure. **Publishing the app** (step 5
above) makes the token long-lived (it then lasts until you revoke it or leave it
unused for six months). If you skipped step 5 and things die a week in, publish
now and run `npm run auth` to mint a fresh token.

`npm run doctor` names this cause specifically if it sees an `invalid_grant`.

---

## Step 2 — connect your assistant

The wizard writes a small launcher at `bin/joshua421-mcp` (absolute paths, so it
runs no matter what working directory your assistant spawns it in) and offers to
wire it into **Claude Desktop** — backing up your config first — and, if you have
the CLI, into **Claude Code**. If you accept the Desktop one, just **restart
Claude Desktop**.

To connect something else, the server *is* that one command over stdio:

- **Claude Desktop** (manual) — add to
  `~/Library/Application Support/Claude/claude_desktop_config.json`:
  ```json
  {
    "mcpServers": {
      "joshua421": { "command": "/absolute/path/to/joshua421/bin/joshua421-mcp" }
    }
  }
  ```
- **Claude Code** (manual) — user scope, so the tools are there in every project:
  ```sh
  claude mcp add --scope user joshua421 -- /absolute/path/to/joshua421/bin/joshua421-mcp
  ```
  Inside this repo you need none of that: a committed `.mcp.json` connects
  joshua421 to any Claude Code session started here.

Once connected, just start talking — on a first visit (no preferences saved yet)
the companion notices and gently offers to set them up. You can also run the
**`begin`** prompt explicitly: in Claude Desktop, the **+** menu → **joshua421**
→ **begin**.

---

## Step 3 — start the nudges (the daily rhythm)

The emails are the loop's heartbeat. Two ways to run the scheduler:

- **Background (macOS) — recommended:** `npm run worker:install` writes and loads
  two launchd agents (morning 07:00, evening 20:00) that run without a terminal
  and survive a reboot. They log to `./logs/`. Manage them with:
  ```sh
  npm run worker:status      # are they loaded?
  npm run worker:uninstall   # remove them
  ```
  To change the times, set `JOSHUA421_MORNING_HOUR` and/or `JOSHUA421_EVENING_HOUR`
  (0–23) in `.env`, then re-run `npm run worker:install`. (Editing the generated
  plists directly won't stick — the next install regenerates them from `.env`.)
- **Foreground / other OSes:** `npm run worker` keeps a scheduler alive as long as
  the terminal is open — the fallback where launchd isn't available.

The nudge decides *whether* and *how gently* to speak from your rhythm and your
silence — a rest day sends nothing, a long gap gets a gentler welcome, never a
scolding. That's `core/cadence.ts`; nothing to configure beyond your grounding.
launchd (or the daemon) owns only the *time* of day; your grounding owns the rest.

### Why the link goes via a web page

Each email's Claude link has to open your **local** Claude Desktop, because that
is where the joshua421 tools live — reflecting in claude.ai on the web would be a
conversation nothing could ever write down. The link that does that is
`claude://claude.ai/new?q=…`, a custom URL scheme.

Gmail refuses to carry it. Its sanitiser **deletes the `href`** of any link whose
scheme isn't `http`/`https`, so the anchor arrives as dead text — clicking does
nothing. (Apple Mail is fine with it.)

So the email links to a plain https page that redirects to the scheme:
`docs/go/index.html`, served for this project at
`https://kennie12345.github.io/joshua421/go/`. The prompt travels in the URL's
**fragment** (`#q=…`), which browsers never send to a server — so whoever hosts
that page sees a bare page request and never your day. The page loads nothing
from the network, and always shows the prompt for copying in case the handoff
doesn't take.

`JOSHUA421_LINK_BASE` in `.env` controls it: point it at your own copy of
`docs/go/` if you'd rather not route through ours, or set it **empty** to mail the
raw `claude://` link (good in Apple Mail, dead in Gmail).

---

## A dedicated calendar (optional)

Everything joshua421 keeps — day summaries, Markers (reflected days), rollups,
side entries, your preferences — lands on your **primary** calendar by default.
To keep joshua421's artifacts tidy and hideable, make a dedicated calendar
instead:

1. Google Calendar → left sidebar → **+ next to "Other calendars" → Create new
   calendar** → name it `joshua421` → Create.
2. Open its **Settings** → scroll to **Integrate calendar** → copy the
   **Calendar ID** (looks like `…@group.calendar.google.com`).
3. Paste it when the wizard asks, or set `JOSHUA421_CALENDAR_ID` in `.env` and
   run `npm run doctor` to confirm it's reachable.

Either way it's *your* calendar — joshua421 stores nothing of its own.

---

## Coming from an earlier install? (`npm run migrate`)

Before the calendar-as-database cutover, joshua421 kept a local behaviour log
(`joshua421.sqlite`) and a local grounding file (`grounding.md`). One command
moves them into your calendar:

```sh
npm run migrate
```

Every reflected day becomes a Marker entry; your grounding becomes the one
preferences entry. It's **safe to re-run** (entries upsert against their day),
and it will **never overwrite** preferences you've since saved through the
conversation — the calendar's copy is the living one. The local files are left
in place as your own backup; delete them whenever you trust the calendar.
`npm run setup` offers this automatically when it finds pre-cutover data, and
`npm run doctor` points at it while anything hasn't crossed.

---

## Troubleshooting

Run **`npm run doctor`** first — it re-checks every pipe read-only (no prompts,
no sends) and points at the fix. Common cases:

| Symptom | Cause | Fix |
| --- | --- | --- |
| Worked for a week, then stopped | The 7-day Testing-mode token expiry | Publish the app (Step 1.5), then `npm run auth` |
| `invalid_grant` | Expired or revoked token | Same as above |
| `GOOGLE_* missing` | `.env` not filled | `npm run setup` |
| Tools absent in Claude Desktop | Config not loaded | Restart Claude Desktop; confirm the launcher path exists |
| Tools absent in Claude Code | Never wired (Desktop and Code are separate) | `claude mcp list` to check; `npm run setup` offers to add it |
| The email's Claude link does nothing | See "Why the link goes via a web page" below | Set `JOSHUA421_LINK_BASE` to a page you host, or use the paste block |
| Nudges ignore my rhythm after updating | Pre-cutover data not migrated | `npm run migrate` (see above) |

To re-authorise at any time (new token, same client): `npm run auth`. To start
over, delete `.env` and run `npm run setup` again.

---

## What the wizard touched

So nothing is a black box:

- **`.env`** — your client id/secret, refresh token, email, and calendar choice,
  written in place (comments preserved). Gitignored.
- **`bin/joshua421-mcp`** — the generated launcher. Machine-specific; gitignored.
- **`claude_desktop_config.json`** — only if you said yes; the previous version is
  saved alongside as `.backup`.
- **Claude Code's user config** — only if you said yes; the wizard runs
  `claude mcp add --scope user joshua421`. Undo with `claude mcp remove --scope user joshua421`.
- **A welcome email** — to yourself, if you said yes; it carries your first
  conversation.

Nothing else lives on this machine: your reflections, notes, Markers, rollups
and preferences all live in *your* calendar. See [design.md](./design.md) for
the privacy model in full.
