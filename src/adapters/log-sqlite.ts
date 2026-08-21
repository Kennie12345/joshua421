import Database from 'better-sqlite3'
import type { Log } from '../core/log'
import type { Reflection } from '../core/reflection'

/**
 * Behaviour-only by construction. There is deliberately NO content column —
 * the privacy promise is enforced by the schema, not by willpower.
 */
export const SCHEMA = `
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
  }
}
