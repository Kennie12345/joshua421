import '../env'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { chmod, copyFile, mkdir, readFile, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { createInterface } from 'node:readline'
import { google } from 'googleapis'
import { mintRefreshToken } from './oauth-flow'
import { updateEnvFile } from './env-file'
import { sendWelcomeEmail } from '../core/flows'
import { makeGoogleMailer, makeGoogleDiary } from '../adapters/google'
import { makeGoogleJournal } from '../adapters/journal-google'
import { makeJournalGrounding } from '../adapters/grounding-journal'
import { isoDay } from '../core/day'
import { runMigration } from './migrate'
import { repoRoot, resolveTsxCli, shQuote } from './paths'

/**
 * `npm run setup` — the ONE guided path from a fresh clone to a working loop:
 * credentials minted and written to .env (never hand-pasted), the pipes proven
 * by a smoke test, the connection wired, a welcome email in the inbox, and the
 * nudge agents pointed to. Rerunnable and safe: every step checks what's already
 * done, and nothing irreversible (a real email, a config overwrite, the browser
 * OAuth flow) happens without an interactive human — a piped/headless run never
 * hangs and never sends.
 *
 * `npm run doctor` (this file with --doctor) — the same checks, read-only, no
 * prompts, no sends. Exit 0 means the loop should work end to end.
 */

const envPath = join(repoRoot, '.env')
const wrapperPath = join(repoRoot, 'bin', 'joshua421-mcp')
const desktopConfigPath = join(homedir(), 'Library/Application Support/Claude/claude_desktop_config.json')
const agentPlist = (job: string) => join(homedir(), 'Library/LaunchAgents', `com.joshua421.${job}.plist`)

const ok = (msg: string) => console.log(`  ✓ ${msg}`)
const bad = (msg: string) => console.log(`  ✗ ${msg}`)
const note = (msg: string) => console.log(`  · ${msg}`)
const say = (msg = '') => console.log(msg)

/** Write to .env AND this process's env, so later steps (lazy Google clients) see it. */
async function saveEnv(updates: Record<string, string>): Promise<void> {
  await updateEnvFile(envPath, updates)
  Object.assign(process.env, updates)
}

const GOOGLE_CLOUD_WALKTHROUGH = `
  joshua421 uses YOUR OWN (free) Google Cloud OAuth client, so no one else ever
  holds your tokens. One-time, ~10 minutes — docs/setup.md has the click-by-click:

    1. Create a project:      https://console.cloud.google.com/projectcreate
    2. Enable two APIs:       https://console.cloud.google.com/apis/library
                              → "Google Calendar API" and "Gmail API", Enable both
    3. Consent screen:        https://console.cloud.google.com/apis/credentials/consent
                              → External → add YOURSELF as a Test user
    4. Create the client:     https://console.cloud.google.com/apis/credentials
                              → Create credentials → OAuth client ID → Desktop app
    5. Publish the app:       Audience → Publish app (stops the 7-day token expiry)
    6. Copy its Client ID and Client Secret below.

  Heads-up: while the consent screen stays in "Testing", Google EXPIRES refresh
  tokens after 7 days — everything silently stops a week in. Publishing (step 5;
  no verification needed for your own use) makes the token long-lived.
  docs/setup.md → "The 7-day trap" explains.
`

/**
 * Probe the refresh token by asking Google for an access token. Distinguishes a
 * genuinely bad grant ('invalid') from being offline ('error') — so the doctor
 * never blames your token for a dropped Wi-Fi connection.
 */
async function tokenStatus(): Promise<'ok' | 'invalid' | 'error' | 'missing'> {
  const { GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REFRESH_TOKEN } = process.env
  if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET || !GOOGLE_REFRESH_TOKEN) return 'missing'
  const auth = new google.auth.OAuth2(GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET)
  auth.setCredentials({ refresh_token: GOOGLE_REFRESH_TOKEN })
  try {
    await auth.getAccessToken()
    return 'ok'
  } catch (err) {
    const code = String((err as NodeJS.ErrnoException)?.code ?? '')
    const msg = err instanceof Error ? err.message : String(err)
    if (/ENOTFOUND|ECONNREFUSED|ETIMEDOUT|EAI_AGAIN|ENETUNREACH|ECONNRESET/.test(code)) return 'error'
    if (/network|getaddrinfo|socket|timeout|dns/i.test(msg) && !/invalid_grant/i.test(msg)) return 'error'
    return 'invalid'
  }
}

const INVALID_TOKEN_HINT =
  'token rejected (invalid_grant is usually the 7-day Testing-mode expiry, or revoked access) — ' +
  'publish the OAuth app (docs/setup.md → "The 7-day trap"), then run `npm run auth`'

/** The launcher Claude Desktop / Claude Code will exec — absolute paths only
 *  (MCP hosts spawn with a bare PATH and an unpredictable cwd), single-quoted so
 *  a repo path with a space or shell metacharacter can't break or inject. */
async function writeMcpWrapper(): Promise<string> {
  const cmd = [process.execPath, resolveTsxCli(), join(repoRoot, 'src/mcp.ts')].map(shQuote).join(' ')
  const script = `#!/bin/sh
# Generated by \`npm run setup\` — rerun it if node or this repo moves.
exec ${cmd}
`
  await mkdir(join(repoRoot, 'bin'), { recursive: true })
  await writeFile(wrapperPath, script, 'utf8')
  await chmod(wrapperPath, 0o755)
  return wrapperPath
}

/** What Claude Desktop's config is: has joshua421, present but not, absent, or unreadable. */
async function desktopConfigState(): Promise<'has' | 'missing-server' | 'absent' | 'corrupt'> {
  if (!existsSync(desktopConfigPath)) return 'absent'
  let raw: string
  try {
    raw = await readFile(desktopConfigPath, 'utf8')
  } catch {
    return 'corrupt'
  }
  try {
    const config = JSON.parse(raw)
    return config?.mcpServers?.joshua421 ? 'has' : 'missing-server'
  } catch {
    return 'corrupt'
  }
}

const execFileAsync = promisify(execFile)
const CLAUDE_PROBE_OPTIONS = {
  // Probe outside this repo so its project-scoped .mcp.json cannot mask whether
  // the user-scoped server (the thing setup offers to add) exists.
  cwd: homedir(),
  timeout: 10_000,
  killSignal: 'SIGKILL' as const,
  maxBuffer: 1024 * 1024,
}

type ClaudeCodeState = 'has' | 'missing' | 'no-cli'

/** Keep CLI absence distinct from a real CLI returning "not configured". */
export function classifyClaudeCodeProbe(stdout: string, errorCode?: string): ClaudeCodeState {
  if (/(^|\n)\s*joshua421\b/.test(stdout)) return 'has'
  return errorCode === 'ENOENT' ? 'no-cli' : 'missing'
}

/**
 * What Claude Code knows: 'has' joshua421, 'missing' it, or 'no-cli' — the
 * `claude` command isn't installed, which is not a problem, just nothing to
 * wire. Claude Code is the SECOND door, and optional: this repo
 * ships a project-scoped .mcp.json that covers sessions started here, and the
 * offer below covers every other project.
 */
async function claudeCodeState(): Promise<ClaudeCodeState> {
  try {
    // `get` is target-specific and does no health checks. `list` can spend tens
    // of seconds checking unrelated servers, and older versions may exit nonzero
    // when any one of them is unhealthy.
    const { stdout } = await execFileAsync('claude', ['mcp', 'get', 'joshua421'], CLAUDE_PROBE_OPTIONS)
    return classifyClaudeCodeProbe(stdout)
  } catch (err) {
    const failure = err as { stdout?: unknown; code?: unknown }
    return classifyClaudeCodeProbe(String(failure.stdout ?? ''), String(failure.code ?? ''))
  }
}

/**
 * Add joshua421 to Claude Code — user scope, so the tools are there in EVERY
 * project, the way Claude Desktop's config is global. (Project scope is already
 * covered inside this repo by the committed .mcp.json.) The absolute wrapper
 * path is right here: this writes a machine-local config, never a shared file.
 */
async function addToClaudeCode(): Promise<void> {
  await execFileAsync('claude', ['mcp', 'add', '--scope', 'user', 'joshua421', '--', wrapperPath], {
    cwd: repoRoot,
    timeout: 10_000,
    killSignal: 'SIGKILL',
    maxBuffer: 1024 * 1024,
  })
}

/**
 * Add joshua421 to Claude Desktop's config. Always backs the file up FIRST, so
 * even an unparseable config is never lost. If the existing JSON is broken we
 * can't merge the user's other servers back in — we start fresh and say so, with
 * the backup pointing the way — rather than crashing the wizard's last step.
 */
async function patchDesktopConfig(): Promise<'ok' | 'recovered'> {
  let config: { mcpServers?: Record<string, unknown> } = {}
  let recovered = false
  if (existsSync(desktopConfigPath)) {
    await copyFile(desktopConfigPath, `${desktopConfigPath}.backup`)
    try {
      const parsed = JSON.parse(await readFile(desktopConfigPath, 'utf8'))
      // Valid JSON that isn't a plain object (a primitive or an array) can't hold
      // mcpServers — treat it like corrupt: backed up above, replaced cleanly below.
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) config = parsed
      else recovered = true
    } catch {
      recovered = true // corrupt JSON — backed up above; write a clean one below
    }
  } else {
    await mkdir(join(homedir(), 'Library/Application Support/Claude'), { recursive: true })
  }
  config.mcpServers = { ...config.mcpServers, joshua421: { command: wrapperPath } }
  await writeFile(desktopConfigPath, JSON.stringify(config, null, 2) + '\n', 'utf8')
  return recovered ? 'recovered' : 'ok'
}

// ── doctor: the same ground, read-only — no prompts, no sends ────────────────

async function doctor(): Promise<never> {
  say('joshua421 · doctor\n')
  let failures = 0
  const check = (passed: boolean, good: string, fix: string) => {
    if (passed) ok(good)
    else {
      bad(fix)
      failures++
    }
  }

  check(existsSync(envPath), '.env exists', '.env missing — run `npm run setup`')
  for (const key of ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET', 'GOOGLE_REFRESH_TOKEN', 'GOOGLE_USER_EMAIL']) {
    check(Boolean(process.env[key]), `${key} set`, `${key} missing — run \`npm run setup\``)
  }

  const token = await tokenStatus()
  if (token === 'error') note("couldn't reach Google (offline?) — token not tested, not necessarily bad")
  else check(token === 'ok', 'Google token works', token === 'invalid' ? INVALID_TOKEN_HINT : 'no token to test')

  if (token === 'ok') {
    const today = isoDay(new Date())
    try {
      const events = await makeGoogleDiary().day(today)
      ok(`calendar read works (${events.length} event(s) today on ${process.env.JOSHUA421_READ_CALENDAR_ID ?? 'primary'})`)
    } catch (err) {
      bad(`calendar read failed — ${err instanceof Error ? err.message : err}`)
      failures++
    }
    const storeId = process.env.JOSHUA421_CALENDAR_ID ?? 'primary'
    if (storeId !== (process.env.JOSHUA421_READ_CALENDAR_ID ?? 'primary')) {
      try {
        await makeGoogleDiary({ readCalendarId: storeId }).day(today)
        ok(`store calendar reachable (${storeId})`)
      } catch {
        bad(`store calendar unreachable (${storeId}) — check JOSHUA421_CALENDAR_ID in .env`)
        failures++
      }
    }
  }

  // The store is the calendar itself (the Journal): Markers, summaries, rollups
  // and preferences all live there. Nothing is stored on this machine.
  if (token === 'ok') {
    try {
      const journal = makeGoogleJournal()
      const markers = await journal.query({ kind: 'reflection' })
      ok(`journal store reachable (${markers.length} reflected day(s) stand as Markers)`)
      const prefs = await makeJournalGrounding(journal).get()
      if (prefs) ok('grounding saved (preferences set, in your calendar)')
      else note('grounding not set yet — the first conversation will offer to set it up (this is fine)')
      // Pre-cutover local stores that haven't crossed into the calendar yet.
      const legacyDb = existsSync(process.env.JOSHUA421_DB ?? '')
      const legacyGrounding = existsSync(process.env.GROUNDING_PATH ?? '')
      if ((legacyGrounding && !prefs) || (legacyDb && markers.length === 0)) {
        note('pre-cutover local data found — `npm run migrate` moves it into your calendar (one-time, safe to re-run)')
      }
    } catch (err) {
      bad(`journal store failed — ${err instanceof Error ? err.message : err}`)
      failures++
    }
  }

  check(existsSync(wrapperPath), 'MCP launcher exists (bin/joshua421-mcp)', 'MCP launcher missing — run `npm run setup`')

  const cfg = await desktopConfigState()
  if (cfg === 'has') ok('Claude Desktop config includes joshua421')
  else if (cfg === 'corrupt') {
    bad(`Claude Desktop config is not valid JSON (${desktopConfigPath}) — fix it, then \`npm run setup\``)
    failures++
  } else {
    bad(`joshua421 not in ${desktopConfigPath} — run \`npm run setup\`, or connect another MCP client per docs/setup.md`)
    failures++
  }

  // Claude Code is the second door and optional — a note, never a failure. (Inside
  // this repo the committed .mcp.json covers it; user scope covers everywhere else.)
  const code = await claudeCodeState()
  if (code === 'has') ok('Claude Code has joshua421')
  else if (code === 'missing') {
    note('joshua421 not in Claude Code user scope — `npm run setup` offers to add it (optional)')
  } else note('Claude Code CLI not found — project .mcp.json will apply when Claude Code is installed (optional)')

  if (process.platform === 'darwin') {
    const agents = existsSync(agentPlist('morning')) && existsSync(agentPlist('evening'))
    if (agents) ok('daily nudge agents installed (launchd)')
    else note('nudge agents not installed — `npm run worker:install` runs them in the background (optional)')
  }

  say(failures === 0 ? '\nAll clear — the loop should work end to end.' : `\n${failures} problem(s) — fixes above.`)
  process.exit(failures === 0 ? 0 : 1)
}

/**
 * A prompt that survives piped stdin: answers buffered while the wizard is
 * mid-await (a token probe, a calendar read) are kept, not dropped. When input
 * is EXHAUSTED, ask() resolves `null` — distinct from an empty line — so callers
 * can tell "the human pressed Enter" (accept the Y/n default) from "there is no
 * human" (fall back to the SAFE default, never the convenient one).
 */
function makePrompter() {
  const rl = createInterface({ input: process.stdin, output: process.stdout })
  const buffered: string[] = []
  const waiting: ((answer: string | null) => void)[] = []
  let closed = false
  rl.on('line', (line) => {
    const next = waiting.shift()
    if (next) next(line)
    else buffered.push(line)
  })
  rl.on('close', () => {
    closed = true
    while (waiting.length) waiting.shift()!(null)
  })
  const ask = (q: string): Promise<string | null> => {
    if (buffered.length > 0) {
      console.log(q)
      return Promise.resolve(buffered.shift()!)
    }
    if (closed) return Promise.resolve(null)
    process.stdout.write(q)
    return new Promise((resolve) => waiting.push(resolve))
  }
  return { ask, close: () => rl.close() }
}

// ── setup: the guided path ────────────────────────────────────────────────────

async function setup(): Promise<void> {
  const interactive = Boolean(process.stdin.isTTY)
  const rl = makePrompter()
  const askText = async (q: string): Promise<string> => (await rl.ask(q))?.trim() ?? ''
  // Enter (an empty line) accepts the Y/n default = yes; EOF/no-human uses `safe`.
  const confirm = async (q: string, safe: boolean): Promise<boolean> => {
    const ans = await rl.ask(`${q} (Y/n) `)
    if (ans === null) return safe
    return !/^n/i.test(ans.trim())
  }

  say('joshua421 · setup — from a fresh clone to a working loop\n')

  // 1 · .env
  if (!existsSync(envPath)) {
    await copyFile(join(repoRoot, '.env.example'), envPath)
    ok('created .env from .env.example')
  } else {
    ok('.env exists')
  }
  // Secure it even on a no-write rerun — it holds the token and client secret.
  await chmod(envPath, 0o600).catch(() => {})

  // 2 · Google OAuth client
  if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
    say(GOOGLE_CLOUD_WALKTHROUGH)
    const id = await askText('  Client ID: ')
    const secret = await askText('  Client Secret: ')
    if (!id || !secret) {
      say('\nNo credentials — do the Google Cloud step (docs/setup.md) and run `npm run setup` again.')
      rl.close()
      process.exit(1)
    }
    await saveEnv({ GOOGLE_CLIENT_ID: id, GOOGLE_CLIENT_SECRET: secret })
    ok('OAuth client written to .env')
  } else {
    ok('Google OAuth client configured')
  }

  // 3 · authorise (refresh token) — verified, not assumed. The browser+consent
  // flow is fundamentally interactive: never auto-triggered headlessly (it would
  // just hang on a redirect that never comes).
  let status = await tokenStatus()
  let mintedThisRun = false
  if (status === 'invalid') bad(INVALID_TOKEN_HINT)
  if (status === 'error') note("couldn't reach Google to check your token (offline?) — skipping the smoke test")
  if (status !== 'ok' && status !== 'error') {
    if (!interactive) {
      note('not a terminal — run `npm run auth` to authorise with Google, then re-run setup')
    } else if (await confirm('  Authorise with Google now (opens your browser)?', false)) {
      try {
        const { refreshToken, email } = await mintRefreshToken(process.env.GOOGLE_CLIENT_ID!, process.env.GOOGLE_CLIENT_SECRET!)
        const updates: Record<string, string> = { GOOGLE_REFRESH_TOKEN: refreshToken }
        if (email && !process.env.GOOGLE_USER_EMAIL) updates.GOOGLE_USER_EMAIL = email
        await saveEnv(updates)
        ok(`authorised${email ? ` as ${email}` : ''} — token written to .env`)
        status = 'ok'
        mintedThisRun = true
      } catch (err) {
        // Denied consent or a stale-grant is a normal outcome, not a crash.
        bad(`authorisation didn't complete — ${err instanceof Error ? err.message : err}. Run \`npm run auth\` to try again.`)
      }
    } else {
      note('skipped — run `npm run auth` later; the smoke test and welcome email are skipped')
    }
  } else if (status === 'ok') {
    ok('Google token works')
  }

  // 3.5 · the one-time cutover migration, offered where it would be discovered:
  // pre-cutover machines hold a SQLite log and a grounding file; the calendar is
  // the store now. Offered only while the calendar has no preferences yet (the
  // strongest "not migrated" signal), so a migrated install stays quiet.
  let prefsInJournal = false
  if (status === 'ok') {
    prefsInJournal = Boolean(await makeJournalGrounding(makeGoogleJournal()).get().catch(() => null))
    const hasLegacy = existsSync(process.env.JOSHUA421_DB ?? '') || existsSync(process.env.GROUNDING_PATH ?? '')
    if (!prefsInJournal && hasLegacy) {
      if (await confirm('  Found pre-cutover local data (log / grounding). Move it into your calendar now?', false)) {
        try {
          await runMigration((msg) => say(msg))
          prefsInJournal = Boolean(await makeJournalGrounding(makeGoogleJournal()).get().catch(() => null))
        } catch (err) {
          bad(`migration failed — ${err instanceof Error ? err.message : err}. \`npm run migrate\` retries it.`)
        }
      } else {
        note('skipped — `npm run migrate` any time (one-time, safe to re-run)')
      }
    }
  }

  // A rerun of a fully-set-up install shouldn't re-ask one-time choices; a first
  // run (or a fresh authorisation) should. Grounding-not-yet-set == not onboarded
  // (read from the calendar when we can reach it; the legacy file is the offline
  // fallback signal).
  const firstRun =
    mintedThisRun || (status === 'ok' ? !prefsInJournal : !existsSync(process.env.GROUNDING_PATH ?? ''))

  // 4 · the address the nudges go to (autofilled from the token when possible)
  if (!process.env.GOOGLE_USER_EMAIL) {
    const email = await askText('  Your email (the nudges go to/from it): ')
    if (email) await saveEnv({ GOOGLE_USER_EMAIL: email })
  }

  // 5 · store calendar — primary is the settled default; a dedicated calendar is
  // a paste-in choice. Only offered on a first run (a plain rerun just reports it,
  // since a set value is indistinguishable from a deliberately-kept "primary").
  const currentCal = process.env.JOSHUA421_CALENDAR_ID ?? 'primary'
  if (firstRun && currentCal === 'primary') {
    say("\n  joshua421's entries (day summaries, Markers, rollups, your preferences) land")
    say('  on your PRIMARY calendar by default. To keep them on a dedicated "joshua421"')
    say('  calendar instead, create one in Google Calendar and paste its ID here')
    say('  (docs/setup.md → "A dedicated calendar" shows how).')
    const calId = await askText('  Calendar ID (Enter to keep primary): ')
    if (calId) {
      await saveEnv({ JOSHUA421_CALENDAR_ID: calId })
      // Validate immediately — a typo shouldn't surface silently weeks later.
      if (status === 'ok') {
        try {
          await makeGoogleDiary({ readCalendarId: calId }).day(isoDay(new Date()))
          ok(`store calendar set and reachable: ${calId}`)
        } catch {
          bad(`saved ${calId}, but it isn't reachable — double-check the ID (docs/setup.md). Edit JOSHUA421_CALENDAR_ID in .env to fix.`)
        }
      } else {
        ok(`store calendar set to ${calId} (unverified — no token yet)`)
      }
    } else {
      ok('store calendar: primary')
    }
  } else {
    ok(`store calendar: ${currentCal}`)
  }

  // 6 · smoke test — prove the read pipes work
  if (status === 'ok') {
    say('\nSmoke test:')
    try {
      const events = await makeGoogleDiary().day(isoDay(new Date()))
      ok(`calendar read works (${events.length} event(s) today)`)
    } catch (err) {
      bad(`calendar read failed — ${err instanceof Error ? err.message : err}`)
    }
    try {
      await makeGoogleJournal().query({ kind: 'preferences' })
      ok('journal store reachable (your calendar holds the log)')
    } catch (err) {
      bad(`journal store failed — ${err instanceof Error ? err.message : err}`)
    }
  }

  // 7 · connect your assistant — BEFORE the welcome email, so the email's
  // first-click deep-link finds the tools already wired in (after a restart).
  say('\nConnect your assistant:')
  await writeMcpWrapper()
  ok(`MCP launcher written: ${wrapperPath}`)
  if (existsSync(join(homedir(), 'Library/Application Support/Claude'))) {
    const cfg = await desktopConfigState()
    if (cfg === 'has') {
      ok('Claude Desktop already has joshua421')
    } else if (await confirm(`  Add joshua421 to Claude Desktop${cfg === 'corrupt' ? ' (its config is currently invalid JSON)' : ' (backs the config up first)'}?`, false)) {
      const result = await patchDesktopConfig()
      if (result === 'recovered') {
        bad(`your Claude Desktop config wasn't valid JSON — backed it up to ${desktopConfigPath}.backup and wrote a fresh one with joshua421. Merge any other servers back from the backup.`)
      } else {
        ok('Claude Desktop config updated — restart Claude Desktop to load it')
      }
    }
  }
  const code = await claudeCodeState()
  if (code === 'has') {
    ok('Claude Code already has joshua421')
  } else if (code === 'missing') {
    if (await confirm('  Add joshua421 to Claude Code too (available in every project)?', false)) {
      try {
        await addToClaudeCode()
        ok('Claude Code updated — the tools are there in your next session')
      } catch (err) {
        bad(`couldn't add it to Claude Code — ${err instanceof Error ? err.message : err}`)
        say(`    do it by hand: claude mcp add --scope user joshua421 -- ${wrapperPath}`)
      }
    }
  } else {
    note('Claude Code CLI not found — skipping (Claude Desktop is the main door)')
  }

  say('\n  Any other MCP client — the server is just this command (stdio):')
  say(`    ${wrapperPath}`)

  // 8 · the welcome email — the "you're in" marker and the first way in. Offered
  // only on a first run (never re-sent on a plain rerun), and never sent without
  // an interactive yes (EOF-safe default is no).
  if (status === 'ok' && process.env.GOOGLE_USER_EMAIL && firstRun) {
    if (await confirm('\n  Send the welcome email (your first conversation; proves sending)?', false)) {
      try {
        await sendWelcomeEmail(makeGoogleMailer())
        ok(`welcome email sent to ${process.env.GOOGLE_USER_EMAIL}`)
      } catch (err) {
        bad(`email send failed — ${err instanceof Error ? err.message : err}`)
      }
    }
  }

  // 9 · what happens next — honest about whether the loop can actually run yet
  if (status === 'ok') {
    say('\nDone. From here:')
    say('  • Restart Claude Desktop, then open it (or the welcome email) and have the')
    say('    first conversation — it sets up your preferences. The `begin` prompt')
    say('    (+ → joshua421) does the same.')
    say('  • Turn on the daily nudges: `npm run worker:install` (background, macOS),')
    say('    or `npm run worker` to run them in this terminal. docs/setup.md → Step 3.')
    say('  • Any time: `npm run doctor` re-checks everything.')
  } else {
    say('\nSetup is incomplete — Google isn\'t authorised yet, so the loop can\'t run.')
    say('  • Authorise: `npm run auth` (or re-run `npm run setup`).')
    say('  • Then: `npm run doctor` to confirm, and `npm run worker:install` for the nudges.')
  }

  rl.close()
}

// Run only as the entry point — importing this module (e.g. to unit-test a helper)
// must not fire the wizard, which writes files, patches config, and can send mail.
const isEntry = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href
if (isEntry) {
  const go = process.argv.includes('--doctor') ? doctor : setup
  go().catch((err) => {
    console.error(err)
    process.exit(1)
  })
}
