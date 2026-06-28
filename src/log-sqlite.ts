import Database from 'better-sqlite3'
import type { Log } from './core/log'
import type { Reflection } from './core/reflection'

/**
 * Behaviour-only by construction. There is deliberately NO content column —
 * the privacy promise is enforced by the schema, not by willpower.
 */
const SCHEMA = `
CREATE TABLE IF NOT EXISTS reflections (
  id        TEXT PRIMARY KEY,
  date      TEXT NOT NULL,
  kind      TEXT NOT NULL,
  status    TEXT NOT NULL,
  event_ref TEXT
);
CREATE INDEX IF NOT EXISTS idx_reflections_date ON reflections (date);
`

interface ReflectionRow {
  id: string
  date: string
  kind: string
  status: string
  event_ref: string | null
}

const rowToReflection = (row: ReflectionRow): Reflection => ({
  id: row.id,
  date: row.date,
  kind: row.kind as Reflection['kind'],
  status: row.status as Reflection['status'],
  eventRef: row.event_ref ?? undefined,
})

/** Local calendar day as YYYY-MM-DD. */
const localDay = (d: Date): string => {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function makeSqliteLog(path = process.env.JOSHUA421_DB ?? './joshua421.sqlite'): Log {
  const db = new Database(path)
  db.exec(SCHEMA)

  const insertStmt = db.prepare(
    `INSERT OR REPLACE INTO reflections (id, date, kind, status, event_ref)
     VALUES (@id, @date, @kind, @status, @event_ref)`,
  )
  const selectAllStmt = db.prepare(
    `SELECT id, date, kind, status, event_ref FROM reflections
     ORDER BY date DESC, rowid DESC`,
  )
  const selectSinceStmt = db.prepare(
    `SELECT id, date, kind, status, event_ref FROM reflections
     WHERE date >= ?
     ORDER BY date DESC, rowid DESC`,
  )
  const shownUpDaysStmt = db.prepare(
    `SELECT DISTINCT date FROM reflections
     WHERE status = 'shown-up'
     ORDER BY date DESC`,
  )

  return {
    async add(reflection: Reflection) {
      insertStmt.run({
        id: reflection.id,
        date: reflection.date,
        kind: reflection.kind,
        status: reflection.status,
        event_ref: reflection.eventRef ?? null,
      })
    },

    async reflections(since?: string) {
      const rows = (
        since === undefined ? selectAllStmt.all() : selectSinceStmt.all(since)
      ) as ReflectionRow[]
      return rows.map(rowToReflection)
    },

    async streak() {
      const days = new Set(
        (shownUpDaysStmt.all() as { date: string }[]).map((r) => r.date),
      )
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
