import './env'
import cron from 'node-cron'
import type { Deps } from './core/deps'
import { lookBack, prepareForEvent, reflectOnDay } from './core/flows'
import { makeSqliteLog } from './log-sqlite'
import { makeClaudeReflector } from './claude'
import { makeGoogleDiary, makeGoogleNotifier, makeGoogleSource } from './google'
import { makeFileGrounding } from './grounding-file'

/**
 * ENTRYPOINT 2 — the scheduled engine. Two ways to run, same jobs:
 *
 *   one-shot:  `worker <job>`   runs one job and exits → used by the launchd
 *              StartCalendarInterval agents. Robust on a laptop that sleeps:
 *              launchd runs a missed job on wake.
 *   daemon:    `worker`         keeps node-cron alive in the foreground → handy
 *              for `npm run worker` while developing.
 */
const deps: Deps = {
  source: makeGoogleSource(),
  reflect: makeClaudeReflector(),
  notify: makeGoogleNotifier(),
  diary: makeGoogleDiary(),
  grounding: makeFileGrounding(),
  log: makeSqliteLog(),
  clock: () => new Date(),
}

// L1 — the jobs. Each is timing-blind and named.
const JOBS: Record<string, (d: Deps) => Promise<unknown>> = {
  prepare: async (d) => {
    const events = await d.source.upcomingEvents(24)
    for (const event of events) await prepareForEvent(event, d)
  },
  reflect: (d) => reflectOnDay(d),
  'look-back': (d) => lookBack(d),
}

async function runJob(name: string): Promise<void> {
  const fn = JOBS[name]
  if (!fn) throw new Error(`unknown job "${name}". valid: ${Object.keys(JOBS).join(', ')}`)
  console.log(`[joshua421] job start: ${name} @ ${new Date().toISOString()}`)
  await fn(deps)
  console.log(`[joshua421] job done:  ${name} @ ${new Date().toISOString()}`)
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
  // Daemon mode (node-cron). L2 — the schedule as data; L3 — the mechanism.
  const SCHEDULE: { cron: string; job: string }[] = [
    { cron: '0 7 * * *', job: 'prepare' },
    { cron: '0 20 * * *', job: 'reflect' },
    { cron: '0 19 * * 0', job: 'look-back' },
  ]
  for (const s of SCHEDULE) {
    cron.schedule(s.cron, () => {
      void runJob(s.job).catch((err) => console.error(`[joshua421] ${s.job}`, err))
    })
  }
  console.log(`joshua421 worker (daemon): ${SCHEDULE.length} jobs scheduled`)
}
