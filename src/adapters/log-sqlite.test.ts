import { test } from 'node:test'
import assert from 'node:assert/strict'
import Database from 'better-sqlite3'
import { makeSqliteLog, SCHEMA } from './log-sqlite'
import type { Reflection } from '../core/reflection'

/**
 * The STRUCTURAL guarantee at the adapter: the promise is enforced by the schema,
 * not by willpower. There is deliberately no column that could hold content — so
 * content is unrepresentable in the store, not merely omitted by discipline.
 */

test('the reflections schema has no column that could hold content', () => {
  const db = new Database(':memory:')
  db.exec(SCHEMA)
  const columns = (db.pragma('table_info(reflections)') as { name: string }[]).map((c) => c.name)
  db.close()

  for (const banned of ['content', 'text', 'body', 'note', 'notes', 'summary', 'entry']) {
    assert.ok(!columns.includes(banned), `reflections must not have a '${banned}' column`)
  }
  for (const required of ['id', 'date', 'kind', 'status', 'event_ref']) {
    assert.ok(columns.includes(required), `reflections must have a '${required}' column`)
  }
})

test('makeSqliteLog round-trips a reflection', async () => {
  const log = makeSqliteLog(':memory:')
  const today = new Date()
  const iso = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`
  const reflection: Reflection = { id: 'r1', date: iso, kind: 'after', status: 'shown-up' }

  await log.add(reflection)

  const all = await log.reflections()
  assert.equal(all.length, 1)
  assert.equal(all[0].id, 'r1')
})
