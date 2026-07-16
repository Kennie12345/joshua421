import { test } from 'node:test'
import assert from 'node:assert/strict'
import { makeProdDeps } from './prod-deps'

test('makeProdDeps assembles every production dependency without calling Google', () => {
  // Every adapter is lazy (the OAuth client builds on first use), so assembling
  // the graph must be side-effect free — no network, no files. Exercising the
  // ports would call Google now that the Log and Grounding live in the calendar,
  // so this stays a shape check on purpose.
  const deps = makeProdDeps()
  for (const key of ['mailer', 'diary', 'grounding', 'log', 'journal', 'clock'] as const) {
    assert.ok(deps[key], `${key} is present`)
  }
  assert.equal(typeof deps.mailer, 'function')
  assert.equal(typeof deps.diary.day, 'function')
  assert.equal(typeof deps.diary.sideEntry, 'function')
  assert.equal(typeof deps.grounding.get, 'function')
  assert.equal(typeof deps.log.reflections, 'function')
  assert.equal(typeof deps.journal.query, 'function')
  assert.equal(typeof deps.clock, 'function')
})
