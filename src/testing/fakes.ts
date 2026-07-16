import { randomUUID } from 'node:crypto'
import type { Deps, Diary, DayEvent } from '../core/deps'
import type { Log } from '../core/log'
import type { Reflection } from '../core/reflection'
import type { Journal, JournalEntry, JournalQuery } from '../core/journal'

/**
 * In-memory test doubles for the ports — no I/O, no network, no secrets. They
 * let a flow run against a minimal Deps and let a test inspect exactly what
 * reached each surface, so the promise ("content only ever flows to the user's
 * own calendar; the store holds behaviour only") is asserted, not assumed.
 */

/** Newest-first by ISO date (stable for equal dates). */
const byDateDesc = <T extends { date: string }>(rows: T[]): T[] =>
  [...rows].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0))

const localDay = (d: Date): string =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

/** A Log that keeps its rows in memory and exposes them for inspection. */
export function makeMemoryLog(): Log & { readonly rows: Reflection[] } {
  const store: Reflection[] = []
  return {
    get rows() {
      return store
    },
    async add(reflection) {
      store.push(reflection)
    },
    async reflections(since) {
      return byDateDesc(since === undefined ? store : store.filter((r) => r.date >= since))
    },
    async streak() {
      const days = new Set(store.filter((r) => r.status === 'shown-up').map((r) => r.date))
      let count = 0
      const cursor = new Date()
      while (days.has(localDay(cursor))) {
        count++
        cursor.setDate(cursor.getDate() - 1)
      }
      return count
    },
  }
}

/** A Diary that records what was written to it (the user's own calendar). */
export function makeMemoryDiary(
  dayEvents: DayEvent[] = [],
): Diary & {
  readonly annotations: { eventId: string; note: string }[]
  readonly strips: string[]
} {
  const annotations: { eventId: string; note: string }[] = []
  const strips: string[] = []
  return {
    annotations,
    strips,
    async day() {
      return dayEvents
    },
    async annotate(eventId, note) {
      annotations.push({ eventId, note })
    },
    async stripAnnotation(eventId) {
      strips.push(eventId)
      for (let i = annotations.length - 1; i >= 0; i--) {
        if (annotations[i].eventId === eventId) annotations.splice(i, 1)
      }
    },
  }
}

/** An in-memory Journal, used for tests and to pre-stage the seam re-cut. */
export function makeMemoryJournal(): Journal & { readonly entries: JournalEntry[] } {
  const store: JournalEntry[] = []
  return {
    get entries() {
      return store
    },
    async upsert(kind, period, entry) {
      const existing = store.find((item) => item.kind === kind && item.period === period)
      if (existing) {
        Object.assign(existing, entry)
        return existing
      }
      const created: JournalEntry = { ...entry, kind, period, id: randomUUID() }
      store.push(created)
      return created
    },
    async query(q: JournalQuery = {}) {
      const matched = store.filter((e) => {
        if (q.kind && e.kind !== q.kind) return false
        if (q.period && e.period !== q.period) return false
        if (q.since && e.date < q.since) return false
        if (q.until && e.date > q.until) return false
        if (q.tags) {
          for (const [k, v] of Object.entries(q.tags)) if (e.tags?.[k] !== v) return false
        }
        return true
      })
      return byDateDesc(matched)
    },
    async delete(id) {
      const i = store.findIndex((x) => x.id === id)
      if (i >= 0) store.splice(i, 1)
    },
  }
}

/** A minimal Deps with in-memory doubles; pass overrides to inspect a surface. */
export function makeDeps(overrides: Partial<Deps> = {}): Deps {
  return {
    mailer: async () => {},
    diary: makeMemoryDiary(),
    grounding: { async get() { return null }, async set() {} },
    log: makeMemoryLog(),
    journal: makeMemoryJournal(),
    clock: () => new Date('2026-07-01T09:00:00'),
    ...overrides,
  }
}
