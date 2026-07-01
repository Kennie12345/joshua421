import { test } from 'node:test'
import assert from 'node:assert/strict'
import { makeMemoryJournal } from '../testing/fakes'

/**
 * Round-trips the in-memory Journal — proving the fake behaves (add/query/update/
 * delete, newest-first, filters), so it's a trustworthy double for the seam re-cut.
 * The empty-body invariant is NOT asserted here: nothing calls journal.add yet, so
 * it would be vacuous. It lands with the migration (when flows records via the
 * Journal), where a type-level constructor makes a 'reflection' entry unable to
 * carry content.
 */

test('memory journal round-trips add / query / update / delete', async () => {
  const j = makeMemoryJournal()

  const a = await j.add({
    kind: 'day-summary',
    date: '2026-07-01',
    title: 'A',
    body: 'body a',
    tags: { level: 'daily' },
  })
  const b = await j.add({
    kind: 'rollup',
    date: '2026-07-03',
    title: 'B',
    body: 'body b',
    tags: { level: 'weekly' },
  })
  assert.ok(a.id && b.id && a.id !== b.id, 'entries get distinct ids')

  // newest first
  assert.deepEqual((await j.query()).map((e) => e.title), ['B', 'A'])
  // filter by kind
  assert.deepEqual((await j.query({ kind: 'rollup' })).map((e) => e.title), ['B'])
  // filter by tag (ANDed)
  assert.deepEqual((await j.query({ tags: { level: 'daily' } })).map((e) => e.title), ['A'])
  // inclusive date range
  assert.deepEqual((await j.query({ since: '2026-07-02' })).map((e) => e.title), ['B'])

  // update patches fields
  await j.update(a.id, { title: 'A2' })
  assert.equal((await j.query({ kind: 'day-summary' }))[0].title, 'A2')

  // delete removes only that entry
  await j.delete(b.id)
  assert.deepEqual((await j.query()).map((e) => e.title), ['A2'])
})
