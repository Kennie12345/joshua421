import './env'
import cron from 'node-cron'
import type { Deps } from './core/deps'
import { sendDailyNudge } from './core/flows'
import { makeSqliteLog } from './log-sqlite'
import { makeFileGrounding } from './grounding-file'
import { makeGoogleDiary, makeGoogleMailer } from './google'

/**
 * ENTRYPOINT 2 — the scheduled engine. Two daily nudge-emails that list the day
 * and point the user into a reflective conversation with their own LLM. The
 * questions arise there, in the conversation; the email is only the nudge.
 *
 *   one-shot:  `worker <job>`   runs one job and exits → the launchd agents.
 *   daemon:    `worker`         keeps node-cron alive → handy for `npm run worker`.
 */
const deps: Deps = {
  mailer: makeGoogleMailer(),
  diary: makeGoogleDiary(),
  grounding: makeFileGrounding(),
  log: makeSqliteLog(),
  clock: () => new Date(),
}

// The two daily jobs — each runs the cadence gate, which sends at most one email.
// The gate can decide NOT to send (rest day, deep-silence backoff, kind off); that
// is a normal outcome, logged, never an error.
const JOBS: Record<string, (d: Deps) => Promise<{ sent: boolean; reason: string }>> = {
  morning: (d) => sendDailyNudge('morning', d),
  evening: (d) => sendDailyNudge('evening', d),
}

async function runJob(name: string): Promise<void> {
  const fn = JOBS[name]
  if (!fn) throw new Error(`unknown job "${name}". valid: ${Object.keys(JOBS).join(', ')}`)
  console.log(`[joshua421] job start: ${name} @ ${new Date().toISOString()}`)
  const { sent, reason } = await fn(deps)
  console.log(`[joshua421] job done:  ${name} @ ${new Date().toISOString()} — ${sent ? 'sent' : 'skipped'} (${reason})`)
}

const job = process.argv[2]

if (job) {
  // One-shot mode (launchd).
  runJob(job)
    .then(() => process.exit(0))
    .catch((err) => {
      console.error(`[joshua421] job failed: ${job}`, err)
      process.exit(1)
    })
} else {
  // Daemon mode (node-cron).
  const SCHEDULE: { cron: string; job: string }[] = [
    { cron: '0 7 * * *', job: 'morning' },
    { cron: '0 20 * * *', job: 'evening' },
  ]
  for (const s of SCHEDULE) {
    cron.schedule(s.cron, () => {
      void runJob(s.job).catch((err) => console.error(`[joshua421] ${s.job}`, err))
    })
  }
  console.log(`joshua421 worker (daemon): ${SCHEDULE.length} jobs scheduled`)
}
