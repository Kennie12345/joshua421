import '../env'
import { writeFileSync } from 'node:fs'
import { relative } from 'node:path'
import { loadSkills } from '../adapters/skills-fs'
import { centreBreath } from '../core/centre'
import { stampFixedCentre } from '../core/skills'
import { REPO_ROOT } from '../env'

const check = process.argv.slice(2).includes('--check')
const drifted: string[] = []

for (const skill of loadSkills()) {
  const stamped = stampFixedCentre(skill.markdown, centreBreath())
  if (stamped === skill.markdown) continue

  const path = `${REPO_ROOT}/skills/${skill.dirName}/SKILL.md`
  if (check) drifted.push(relative(REPO_ROOT, path))
  else writeFileSync(path, stamped)
}

if (drifted.length > 0) {
  for (const path of drifted) console.error(`Fixed-centre stamp drift: ${path}`)
  process.exitCode = 1
}
