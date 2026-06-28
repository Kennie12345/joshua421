import { randomUUID } from 'node:crypto'
import type { Deps, SourceEvent } from './deps'
import type { Note, Reflection } from './reflection'

/** What an act-flow returns: the reflection recorded + the (transient) note. */
export interface FlowResult {
  reflection: Reflection
  note: Note
}

/**
 * ISO local day (YYYY-MM-DD) for a Date. Local calendar fields so the record
 * date, the look-back window, and the log's streak walk all agree on the
 * user's local day.
 */
function isoDay(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/** BEFORE — help bring a God-honouring posture into an upcoming event. */
export async function prepareForEvent(event: SourceEvent, deps: Deps): Promise<FlowResult> {
  const note = await deps.reflect('before', { event })
  await deps.notify(note, { eventRef: event.id })
  const reflection: Reflection = {
    id: randomUUID(),
    date: isoDay(deps.clock()),
    kind: 'before',
    status: 'shown-up',
    eventRef: event.id,
  }
  await deps.log.add(reflection)
  return { reflection, note }
}

/** AFTER / end of day — reflect on the day, tying it back to God's faithfulness. */
export async function reflectOnDay(deps: Deps): Promise<FlowResult> {
  const today = isoDay(deps.clock())
  const ctx = await deps.source.contextForDay(today)
  const note = await deps.reflect('after', ctx)
  await deps.notify(note)
  const reflection: Reflection = {
    id: randomUUID(),
    date: today,
    kind: 'after',
    status: 'shown-up',
  }
  await deps.log.add(reflection)
  return { reflection, note }
}

/**
 * LOOK BACK — "look how faithful God has been." Built from the log alone
 * (dates, kinds, streak), never from the content of what was written.
 */
export async function lookBack(deps: Deps): Promise<Note> {
  const reflections = await deps.log.reflections()
  const streak = await deps.log.streak()

  const cutoff = isoDay(new Date(deps.clock().getTime() - 13 * 24 * 60 * 60 * 1000))
  const last14 = reflections.filter((r) => r.date >= cutoff).length

  const record = reflections.map((r) => `${r.date} ${r.kind}`).join(', ')
  const notes = [
    `total reflections: ${reflections.length}`,
    `reflections in the last 14 days: ${last14}`,
    `current streak: ${streak}`,
    `record: ${record}`,
  ].join('\n')

  const note = await deps.reflect('look-back', { notes })
  await deps.notify(note)
  return note
}

export { isoDay }
