import 'dotenv/config'
import cron from 'node-cron'
import type { Deps } from './core/deps'
import { lookBack, prepareForEvent, reflectOnDay } from './core/flows'
import { makeSqliteCairn } from './cairn-sqlite'
import { makeClaudeReflector } from './claude'
import { makeGoogleNotifier, makeGoogleSource } from './google'

/**
 * ENTRYPOINT 2 — the always-on scheduled loop. Same engine, wired to a clock
 * instead of a human. Three levels of abstraction, kept separate:
 *   L1  the work      -> core/flows  (timing-blind)
 *   L2  the trigger   -> TRIGGERS    (the schedule as data)
 *   L3  the mechanism -> node-cron   (concrete; swap at the deploy tripwire)
 */
const deps: Deps = {
  source: makeGoogleSource(),
  reflect: makeClaudeReflector(),
  notify: makeGoogleNotifier(),
  cairn: makeSqliteCairn(),
  clock: () => new Date(),
}

/** L2 — the schedule as DATA. v1 implements wall-clock triggers only; the shape
 *  is meant to grow an `EventRelative` variant ("12h before each event") later. */
interface Trigger {
  id: string
  cron: string // wall-clock, in the worker's timezone
  run: (deps: Deps) => Promise<unknown>
}

const TRIGGERS: Trigger[] = [
  {
    id: 'morning-prepare',
    cron: '0 7 * * *',
    run: async (d) => {
      const events = await d.source.upcomingEvents(24)
      for (const event of events) await prepareForEvent(event, d)
    },
  },
  { id: 'evening-reflect', cron: '0 20 * * *', run: (d) => reflectOnDay(d) },
  { id: 'weekly-look-back', cron: '0 19 * * 0', run: (d) => lookBack(d) },
]

// L3 — the mechanism. Reads triggers, fires flows.
for (const trigger of TRIGGERS) {
  cron.schedule(trigger.cron, () => {
    void trigger.run(deps).catch((err) => console.error(`[${trigger.id}]`, err))
  })
}

console.log(`joshua421 worker: ${TRIGGERS.length} triggers scheduled`)
