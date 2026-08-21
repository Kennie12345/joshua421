import './env'
import { appendFile, mkdir } from 'node:fs/promises'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import cron from 'node-cron'
import type { Deps } from './core/deps'
import { sendDailyNudge } from './core/flows'
import { makeProdDeps } from './prod-deps'
import { isTransient, describeError } from './core/transient'

/**
 * ENTRYPOINT 2 — the scheduled engine. Two daily nudge-emails that list the day
 * and point the user into a reflective conversation with their own LLM. The
 * questions arise there, in the conversation; the email is only the nudge.
 *
 *   one-shot:  `worker <job>`   runs one job and exits → the launchd agents.
 *   daemon:    `worker`         keeps node-cron alive → handy for `npm run worker`.
 */
const deps = makeProdDeps()

const logsDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'logs')

/**
 * Append one line to the job's own log — the record `npm run doctor` reads to
 * answer "when did a nudge last actually go out?".
 *
 * The worker writes this itself rather than leaning on launchd's stdout
 * redirection, because a foreground `npm run worker morning` produces no
 * redirected stdout at all. When the doctor could only see launchd's file, the
 * very command it recommended to fix "no nudge yet" could not clear its own
 * warning. Best-effort: a nudge that was sent must never be undone by a
 * read-only log directory.
 */
async function record(job: string, line: string): Promise<void> {
  try {
    await mkdir(logsDir, { recursive: true })
    await appendFile(join(logsDir, `${job}.log`), `${line}\n`, 'utf8')
  } catch {
    /* the email already went; a log we cannot write is not worth failing over */
  }
}

// The two daily jobs — each runs the cadence gate, which sends at most one email.
// The gate can decide NOT to send (rest day, a kind switched off, long dormancy);
// that is a normal outcome, logged, never an error.
const JOBS: Record<string, (d: Deps) => Promise<{ sent: boolean; reason: string }>> = {
  morning: (d) => sendDailyNudge('morning', d),
  evening: (d) => sendDailyNudge('evening', d),
}

const RETRY_DELAYS_MS = [5_000, 20_000, 60_000] // ~85s total — a waking laptop wins

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

/**
 * Run a job, retrying only what is worth retrying. A transient failure is the
 * machine being offline; we wait for it, briefly, because a nudge sent late is
 * worth infinitely more than a nudge lost. A genuine fault (a bad token, a broken
 * calendar id) is NOT retried — it would fail identically three times and bury the
 * message. Returns the outcome instead of throwing so the caller decides the code.
 */
async function runJob(name: string): Promise<{ ok: boolean; fatal: boolean }> {
  const fn = JOBS[name]
  if (!fn) {
    console.error(`[joshua421] unknown job "${name}". valid: ${Object.keys(JOBS).join(', ')}`)
    return { ok: false, fatal: true }
  }
  console.log(`[joshua421] job start: ${name} @ ${new Date().toISOString()}`)

  for (let attempt = 0; ; attempt++) {
    try {
      const { sent, reason } = await fn(deps)
      const verb = sent ? 'sent' : 'skipped'
      const line = `[joshua421] job done:  ${name} @ ${new Date().toISOString()} — ${verb} (${reason})`
      console.log(line)
      await record(name, line)
      return { ok: true, fatal: false }
    } catch (err) {
      const transient = isTransient(err)
      const delay = RETRY_DELAYS_MS[attempt]
      if (transient && delay !== undefined) {
        console.warn(`[joshua421] ${name}: offline (${describeError(err)}) — retrying in ${delay / 1000}s`)
        await sleep(delay)
        continue
      }
      if (transient) {
        // Still offline after the last retry. The machine had no network; that is
        // not a fault in joshua421, so it exits clean. Tomorrow's nudge is
        // unaffected, and `npm run doctor` reports when a nudge last went out.
        const line = `[joshua421] job done:  ${name} @ ${new Date().toISOString()} — skipped (offline: ${describeError(err)})`
        console.warn(line)
        await record(name, line)
        return { ok: false, fatal: false }
      }
      console.error(`[joshua421] job failed: ${name} —`, err)
      return { ok: false, fatal: true }
    }
  }
}

/** An hour from .env, or the default. The launchd installer reads the same vars. */
function hour(envVar: string, fallback: number): number {
  const raw = process.env[envVar]
  const n = raw === undefined ? NaN : Number(raw)
  return Number.isInteger(n) && n >= 0 && n <= 23 ? n : fallback
}

const job = process.argv[2]

if (job) {
  // One-shot mode (launchd). Exit 1 ONLY for a real fault, so a nonzero status in
  // `launchctl list` means something is actually wrong and worth looking at.
  runJob(job).then(({ fatal }) => process.exit(fatal ? 1 : 0))
} else {
  // Daemon mode (node-cron) — the non-macOS fallback. It honours the same
  // JOSHUA421_*_HOUR vars as the launchd installer, so the two paths can't drift.
  const SCHEDULE = [
    { cron: `0 ${hour('JOSHUA421_MORNING_HOUR', 7)} * * *`, job: 'morning' },
    { cron: `0 ${hour('JOSHUA421_EVENING_HOUR', 20)} * * *`, job: 'evening' },
  ]
  for (const s of SCHEDULE) {
    cron.schedule(s.cron, () => {
      void runJob(s.job)
    })
  }
  console.log(
    `joshua421 worker (daemon): ${SCHEDULE.map((s) => `${s.job} at ${s.cron.split(' ')[1]}:00`).join(', ')}`,
  )
}
