import { randomUUID } from 'node:crypto'
import type { Deps, SourceEvent } from './deps'
import type { Reflection, Stone } from './stone'

/** What an act-flow returns: the stone laid + the (transient) reflection text. */
export interface FlowResult {
  stone: Stone
  reflection: Reflection
}

/**
 * ISO local day (YYYY-MM-DD) for a Date. Uses local calendar fields so the
 * stone date, lookBack window, and the cairn's streak walk all agree on the
 * user's local day. (Duplicated from the sqlite adapter's localDay; core must
 * not depend on an adapter.)
 */
function isoDay(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/**
 * BEFORE — help bring a God-honouring posture into an upcoming event.
 * Reads nothing it shouldn't; reflects; delivers; lays one stone.
 */
export async function prepareForEvent(event: SourceEvent, deps: Deps): Promise<FlowResult> {
  const r = await deps.reflect('before', { event })
  await deps.notify(r, { eventRef: event.id })
  const stone: Stone = {
    id: randomUUID(),
    date: isoDay(deps.clock()),
    kind: 'before',
    status: 'shown-up',
    eventRef: event.id,
  }
  await deps.cairn.addStone(stone)
  return { stone, reflection: r }
}

/**
 * AFTER / end of day — reflect on the day that passed, tying it back to God's
 * faithfulness. Content is read live in deps.source and discarded.
 */
export async function reflectOnDay(deps: Deps): Promise<FlowResult> {
  const today = isoDay(deps.clock())
  const ctx = await deps.source.contextForDay(today)
  const r = await deps.reflect('after', ctx)
  await deps.notify(r)
  const stone: Stone = {
    id: randomUUID(),
    date: today,
    kind: 'after',
    status: 'shown-up',
  }
  await deps.cairn.addStone(stone)
  return { stone, reflection: r }
}

/**
 * LOOK BACK — "look how faithful God has been." Built from the cairn alone
 * (dates, kinds, streak), never from the content of what was written.
 */
export async function lookBack(deps: Deps): Promise<Reflection> {
  const stones = await deps.cairn.stones()
  const streak = await deps.cairn.streak()

  const cutoff = isoDay(new Date(deps.clock().getTime() - 13 * 24 * 60 * 60 * 1000))
  const last14 = stones.filter((s) => s.date >= cutoff).length

  const record = stones.map((s) => `${s.date} ${s.kind}`).join(', ')
  const notes = [
    `total stones: ${stones.length}`,
    `stones in the last 14 days: ${last14}`,
    `current streak: ${streak}`,
    `record: ${record}`,
  ].join('\n')

  const r = await deps.reflect('look-back', { notes })
  await deps.notify(r)
  return r
}

export { isoDay }
