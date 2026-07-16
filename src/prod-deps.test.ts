import { test } from 'node:test'
import assert from 'node:assert/strict'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { makeProdDeps } from './prod-deps'

test('makeProdDeps assembles every production dependency without calling Google', async () => {
  const previous = process.env.JOSHUA421_DB
  process.env.JOSHUA421_DB = join(tmpdir(), `joshua421-${randomUUID()}.sqlite`)
  try {
    const deps = makeProdDeps()
    for (const key of ['mailer', 'diary', 'grounding', 'log', 'journal', 'clock'] as const) {
      assert.ok(deps[key], `${key} is present`)
    }
    assert.equal(typeof deps.mailer, 'function')
    assert.equal(typeof deps.diary.day, 'function')
    assert.equal(typeof deps.grounding.get, 'function')
    assert.equal(typeof deps.log.reflections, 'function')
    assert.equal(typeof deps.journal.query, 'function')
    assert.equal(typeof deps.clock, 'function')
    await deps.log.reflections()
  } finally {
    if (previous === undefined) delete process.env.JOSHUA421_DB
    else process.env.JOSHUA421_DB = previous
  }
})
