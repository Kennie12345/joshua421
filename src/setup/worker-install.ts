import '../env'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { mkdir, writeFile, rm } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { repoRoot, resolveTsxCli, xmlEscape } from './paths'

/**
 * `npm run worker:install` — turn the two daily nudges into durable background
 * jobs (macOS launchd), so the loop's heartbeat survives a closed terminal and a
 * reboot. This is the reproducible version of the hand-installed agents: one
 * command instead of hand-written plists, and the same jobs a second self-host
 * user (BYO-OAuth) will need. `:uninstall` removes them; `:status` shows whether
 * they're loaded. launchd owns the TIME of day (07:00 / 20:00); the cadence gate
 * (core/cadence.ts) still owns whether and how gently each fire actually sends.
 *
 * Non-macOS: no launchd — run `npm run worker` (node-cron daemon) instead.
 */

const run = promisify(execFile)

const agentsDir = join(homedir(), 'Library/LaunchAgents')
const logsDir = join(repoRoot, 'logs')
const workerTs = join(repoRoot, 'src/worker.ts')

interface Agent {
  job: 'morning' | 'evening'
  hour: number
}

/** The nudge hour, from .env if set (JOSHUA421_MORNING_HOUR / _EVENING_HOUR),
 *  else the 07:00 / 20:00 defaults. Editing .env and re-running `worker:install`
 *  is the one workflow that actually persists — a plist edit would be overwritten
 *  by the next install, so the time lives in config, not in the generated file. */
function hourFromEnv(key: string, fallback: number): number {
  const n = Number(process.env[key])
  return Number.isInteger(n) && n >= 0 && n <= 23 ? n : fallback
}
const AGENTS: Agent[] = [
  { job: 'morning', hour: hourFromEnv('JOSHUA421_MORNING_HOUR', 7) },
  { job: 'evening', hour: hourFromEnv('JOSHUA421_EVENING_HOUR', 20) },
]

const label = (job: string) => `com.joshua421.${job}`
const plistPath = (job: string) => join(agentsDir, `${label(job)}.plist`)

/** A launchd plist: run `node tsx worker.ts <job>` at a fixed hour each day. */
export function plistXml(a: Agent, node: string, tsxCli: string): string {
  const args = [node, tsxCli, workerTs, a.job]
  const argXml = args.map((x) => `    <string>${xmlEscape(x)}</string>`).join('\n')
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>${label(a.job)}</string>
  <key>ProgramArguments</key>
  <array>
${argXml}
  </array>
  <key>StartCalendarInterval</key>
  <dict><key>Hour</key><integer>${a.hour}</integer><key>Minute</key><integer>0</integer></dict>
  <key>RunAtLoad</key><false/>
  <key>StandardOutPath</key><string>${xmlEscape(join(logsDir, `${a.job}.log`))}</string>
  <key>StandardErrorPath</key><string>${xmlEscape(join(logsDir, `${a.job}.log`))}</string>
  <key>EnvironmentVariables</key>
  <dict><key>PATH</key><string>/usr/local/bin:/usr/bin:/bin:/opt/homebrew/bin</string></dict>
</dict>
</plist>
`
}

/** Best-effort launchctl call — returns false on failure instead of throwing,
 *  so a missing prior load (bootout) doesn't abort a reinstall. */
async function launchctl(args: string[]): Promise<boolean> {
  try {
    await run('launchctl', args)
    return true
  } catch {
    return false
  }
}

function requireMac(): void {
  if (process.platform !== 'darwin') {
    say('worker:install is macOS-only (launchd).')
    say('On other systems, run the scheduler in the foreground instead:')
    say('  npm run worker')
    process.exit(1)
  }
}

const say = (msg = '') => console.log(msg)
const ok = (msg: string) => console.log(`  ✓ ${msg}`)

async function install(): Promise<void> {
  requireMac()
  const node = process.execPath
  const tsxCli = resolveTsxCli()
  await mkdir(agentsDir, { recursive: true })
  await mkdir(logsDir, { recursive: true })
  const uid = process.getuid!()

  say('joshua421 · installing the daily nudge agents (launchd)\n')
  let allLoaded = true
  for (const a of AGENTS) {
    const path = plistPath(a.job)
    await writeFile(path, plistXml(a, node, tsxCli), 'utf8')
    // Reload cleanly: bootout any prior copy (ignored if absent), then bootstrap.
    // Fall back to the older load/unload verbs on macOS builds without bootstrap.
    await launchctl(['bootout', `gui/${uid}/${label(a.job)}`])
    let loaded = await launchctl(['bootstrap', `gui/${uid}`, path])
    if (!loaded) {
      await launchctl(['unload', path])
      loaded = await launchctl(['load', '-w', path])
    }
    const at = `${String(a.hour).padStart(2, '0')}:00`
    if (loaded) ok(`${label(a.job)} → ${at} daily (logs: ${join(logsDir, `${a.job}.log`)})`)
    else {
      allLoaded = false
      console.log(`  ✗ ${label(a.job)} written but launchctl wouldn't load it — check \`npm run worker:status\` and Console.app`)
    }
  }
  if (allLoaded) say('\nDone. The nudges now run on their own; no terminal needs to stay open.')
  else say('\nSome agents were written but not loaded — see the ✗ above.')
  say('  • Change the times: set JOSHUA421_MORNING_HOUR / _EVENING_HOUR in .env, then re-run this.')
  say('  • Stop them:        `npm run worker:uninstall`')
  say('  • Check them:       `npm run worker:status`')
  say('  • Whether each fire actually sends is your rhythm (grounding), not the clock.')
}

async function uninstall(): Promise<void> {
  requireMac()
  const uid = process.getuid!()
  say('joshua421 · removing the daily nudge agents\n')
  for (const a of AGENTS) {
    await launchctl(['bootout', `gui/${uid}/${label(a.job)}`])
    const path = plistPath(a.job)
    if (existsSync(path)) await rm(path)
    ok(`${label(a.job)} removed`)
  }
  say('\nDone. Run `npm run worker:install` to bring them back.')
}

async function status(): Promise<void> {
  requireMac()
  say('joshua421 · nudge agents\n')
  for (const a of AGENTS) {
    const path = plistPath(a.job)
    const loaded = existsSync(path) && (await launchctl(['list', label(a.job)]))
    console.log(`  ${loaded ? '✓ loaded ' : '· not set'}  ${label(a.job)}  (${String(a.hour).padStart(2, '0')}:00)`)
  }
  say('\n  loaded = scheduled with launchd. `npm run worker:install` to (re)install.')
}

// Run only as the entry point — importing this module (e.g. from a test) must
// not fire install/uninstall, which mutate launchd on the machine.
const isEntry = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href
if (isEntry) {
  const cmd = process.argv[2] ?? 'install'
  const run_ = cmd === 'uninstall' ? uninstall : cmd === 'status' ? status : install
  run_().catch((err) => {
    console.error(err)
    process.exit(1)
  })
}
