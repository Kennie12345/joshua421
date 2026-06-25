import Database from 'better-sqlite3'
import type { Cairn } from './core/cairn'
import type { Stone } from './core/stone'

/**
 * Behaviour-only by construction. There is deliberately NO content column —
 * the privacy promise is enforced by the schema, not by willpower.
 */
const SCHEMA = `
CREATE TABLE IF NOT EXISTS stones (
  id        TEXT PRIMARY KEY,
  date      TEXT NOT NULL,
  kind      TEXT NOT NULL,
  status    TEXT NOT NULL,
  event_ref TEXT
);
CREATE INDEX IF NOT EXISTS idx_stones_date ON stones (date);
`

interface StoneRow {
  id: string
  date: string
  kind: string
  status: string
  event_ref: string | null
}

const rowToStone = (row: StoneRow): Stone => ({
  id: row.id,
  date: row.date,
  kind: row.kind as Stone['kind'],
  status: row.status as Stone['status'],
  eventRef: row.event_ref ?? undefined,
})

/** Local calendar day as YYYY-MM-DD. */
const localDay = (d: Date): string => {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function makeSqliteCairn(path = process.env.CAIRN_DB_PATH ?? './cairn.sqlite'): Cairn {
  const db = new Database(path)
  db.exec(SCHEMA)

  const insertStmt = db.prepare(
    `INSERT OR REPLACE INTO stones (id, date, kind, status, event_ref)
     VALUES (@id, @date, @kind, @status, @event_ref)`,
  )
  const selectAllStmt = db.prepare(
    `SELECT id, date, kind, status, event_ref FROM stones
     ORDER BY date DESC, rowid DESC`,
  )
  const selectSinceStmt = db.prepare(
    `SELECT id, date, kind, status, event_ref FROM stones
     WHERE date >= ?
     ORDER BY date DESC, rowid DESC`,
  )
  const shownUpDaysStmt = db.prepare(
    `SELECT DISTINCT date FROM stones
     WHERE status = 'shown-up'
     ORDER BY date DESC`,
  )

  return {
    async addStone(stone: Stone) {
      insertStmt.run({
        id: stone.id,
        date: stone.date,
        kind: stone.kind,
        status: stone.status,
        event_ref: stone.eventRef ?? null,
      })
    },

    async stones(since?: string) {
      const rows = (
        since === undefined ? selectAllStmt.all() : selectSinceStmt.all(since)
      ) as StoneRow[]
      return rows.map(rowToStone)
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
