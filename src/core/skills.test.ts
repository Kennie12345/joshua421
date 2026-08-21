import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseSkill, skillIndex, stampFixedCentre, validateSkillName } from './skills'

const markdown = `---
name: joshua421-example
description: Do one thing well. Use it when an example is needed.
license: Example License
metadata:
  author: joshua421
---

# Example

The practice body.
`

test('parseSkill reads the authored frontmatter fields and separates the body', () => {
  assert.deepEqual(parseSkill(markdown), {
    name: 'joshua421-example',
    description: 'Do one thing well. Use it when an example is needed.',
    license: 'Example License',
    body: '# Example\n\nThe practice body.\n',
  })
})

test('parseSkill requires a name and a non-empty description of at most 1024 characters', () => {
  assert.throws(() => parseSkill('---\ndescription: Present.\n---\nBody'), /name/i)
  assert.throws(() => parseSkill('---\nname: valid-name\n---\nBody'), /description/i)
  assert.throws(() => parseSkill('---\nname: valid-name\ndescription:   \n---\nBody'), /description/i)
  assert.throws(
    () => parseSkill(`---\nname: valid-name\ndescription: ${'x'.repeat(1025)}\n---\nBody`),
    /1024/,
  )
})

test('validateSkillName enforces the Agent Skills name constraints', () => {
  assert.doesNotThrow(() => validateSkillName('joshua421-example', 'joshua421-example'))
  for (const invalid of ['Uppercase', '-leading', 'trailing-', 'two--hyphens', 'under_score', '', 'x'.repeat(65)]) {
    assert.throws(() => validateSkillName(invalid, invalid), invalid || 'empty name')
  }
  assert.throws(() => validateSkillName('valid-name', 'different-dir'), /directory/i)
})

test('stampFixedCentre replaces only the generated block and is idempotent', () => {
  const source = `before
<!-- fixed-centre:start — generated -->
old centre
<!-- fixed-centre:end -->
after`
  const stamped = stampFixedCentre(source, 'canonical centre')
  assert.equal(
    stamped,
    `before
<!-- fixed-centre:start — generated -->
canonical centre
<!-- fixed-centre:end -->
after`,
  )
  assert.equal(stampFixedCentre(stamped, 'canonical centre'), stamped)
  assert.throws(() => stampFixedCentre('no markers', 'centre'), /fixed-centre/i)
})

test('skillIndex carries every description whole, so the loader can match on "Use when"', () => {
  assert.equal(
    skillIndex([
      { name: 'second', description: 'Second sentence one. Use when it is second.' },
      { name: 'first', description: 'First sentence! Use when it is first.' },
    ]),
    '- second — Second sentence one. Use when it is second.\n- first — First sentence! Use when it is first.',
  )
})
