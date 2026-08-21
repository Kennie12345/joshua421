import { test } from 'node:test'
import assert from 'node:assert/strict'
import { centreBreath } from '../core/centre'
import { extractFixedCentre } from '../core/skills'
import { loadSkills } from './skills-fs'

test('every shipped skill parses, matches its directory, and carries the canonical fixed centre', () => {
  const skills = loadSkills()
  assert.equal(skills.length, 6, 'all six authored practices should ship')
  for (const skill of skills) {
    assert.equal(skill.dirName, skill.name, `${skill.dirName}: frontmatter name must match its folder`)
    assert.equal(extractFixedCentre(skill.markdown), centreBreath(), `${skill.name}: fixed centre has drifted`)
  }
})
