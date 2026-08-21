import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { REPO_ROOT } from '../env'
import { parseSkill, validateSkillName, type Skill } from '../core/skills'

/** Load only the practices authored and shipped in this repository. */
export function loadSkills(): Skill[] {
  const skillsRoot = join(REPO_ROOT, 'skills')
  return readdirSync(skillsRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => {
      const markdown = readFileSync(join(skillsRoot, entry.name, 'SKILL.md'), 'utf8')
      const parsed = parseSkill(markdown)
      validateSkillName(parsed.name, entry.name)
      return { ...parsed, dirName: entry.name, markdown }
    })
    .sort((a, b) => a.name.localeCompare(b.name))
}
