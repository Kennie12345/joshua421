import { test } from 'node:test'
import assert from 'node:assert/strict'
import { CLAUSES, BREATH_ONLY, CENTRE_FOR, centreBreath, centreFor, describeTool } from './centre'
import type { Act, ClauseId } from './centre'
import { COMPANION_INSTRUCTIONS, FIXED_CENTRE } from './persona'

const ids = CLAUSES.map((clause) => clause.id)

test('the centre has exactly one source: the persona ships what the clauses say', () => {
  assert.equal(FIXED_CENTRE, centreBreath(), 'FIXED_CENTRE must be composed from CLAUSES, never re-typed')
  for (const clause of CLAUSES) {
    assert.ok(centreBreath().includes(clause.breath), `${clause.id}: missing from the breath`)
  }
})

test('every clause survives in the persona long-form, or is pinned as breath-only', () => {
  // The long-form is authored product voice and is never generated from this data —
  // the anchors are how we prove the two have not drifted apart.
  for (const clause of CLAUSES) {
    if (clause.anchor === undefined) continue
    assert.ok(
      COMPANION_INSTRUCTIONS.includes(clause.anchor),
      `${clause.id}: the persona no longer says "${clause.anchor}" — the centre and the long-form have forked`,
    )
  }
  const anchorless = CLAUSES.filter((clause) => clause.anchor === undefined).map((clause) => clause.id)
  assert.deepEqual(
    anchorless,
    [...BREATH_ONLY],
    'a clause the long-form never expands must be pinned in BREATH_ONLY, deliberately',
  )
})

test('every projection is drawn from the clauses, without repeating one', () => {
  for (const [act, projection] of Object.entries(CENTRE_FOR)) {
    for (const id of projection) assert.ok(ids.includes(id), `${act}: unknown clause "${id}"`)
    assert.equal(new Set(projection).size, projection.length, `${act}: repeats a clause`)
  }
})

test('reading the day carries the WHOLE centre — the projection that must not be trimmed', () => {
  // read_day is the first call of every reflection, so this is where the centre
  // re-enters a client that never fetched the server's instructions.
  assert.deepEqual([...CENTRE_FOR.reflect], ids)
  assert.equal(centreFor('reflect'), centreBreath())
})

test('no clause is stranded: every one of them reaches some act', () => {
  const reached = new Set(Object.values(CENTRE_FOR).flat())
  for (const id of ids) assert.ok(reached.has(id), `${id}: bears on no act — it would ship only in the persona`)
})

test('every act that writes carries consent', () => {
  const writing: readonly Act[] = ['write', 'keep', 'remember']
  for (const act of writing) {
    assert.ok(CENTRE_FOR[act].includes('consent'), `${act}: writes without carrying "propose first"`)
  }
})

test('gathering the stones carries the clauses that keep a memorial from becoming a tally', () => {
  for (const id of ['memorial', 'unseen'] as ClauseId[]) {
    assert.ok(CENTRE_FOR.gather.includes(id), `look_back must carry "${id}"`)
  }
})

test('loading a practice carries no centre, because the practice it returns already does', () => {
  assert.deepEqual([...CENTRE_FOR.load], [])
  assert.equal(centreFor('load'), '')
  assert.equal(describeTool('load', 'Load the practice.'), 'Load the practice.')
})

test('describeTool states the purpose first, then only the clauses that bear on the act', () => {
  const described = describeTool('reverse', 'Undo a write.')
  assert.ok(described.startsWith('Undo a write.\n'))
  assert.equal(described, `Undo a write.\n${centreFor('reverse')}`)
  assert.ok(!described.includes('one question per message'), 'reverse must not recite the rules of speaking')
})
