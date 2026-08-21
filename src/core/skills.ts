export interface ParsedSkill {
  name: string
  description: string
  license?: string
  body: string
}

export interface Skill extends ParsedSkill {
  dirName: string
  markdown: string
}

function unquote(value: string): string {
  if (value.length >= 2 && value[0] === value.at(-1) && (value[0] === '"' || value[0] === "'")) {
    return value.slice(1, -1)
  }
  return value
}

/** Parse the small, single-line frontmatter surface authored by this project. */
export function parseSkill(markdown: string): ParsedSkill {
  const match = markdown.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/)
  if (!match) throw new Error('Skill must begin with frontmatter')

  const fields = new Map<string, string>()
  for (const line of match[1].split(/\r?\n/)) {
    if (/^\s/.test(line)) continue
    const separator = line.indexOf(':')
    if (separator < 0) continue
    fields.set(line.slice(0, separator).trim(), unquote(line.slice(separator + 1).trim()))
  }

  const name = fields.get('name') ?? ''
  const description = fields.get('description') ?? ''
  if (!name) throw new Error('Skill frontmatter requires a name')
  if (!description) throw new Error('Skill frontmatter requires a non-empty description')
  if (description.length > 1024) throw new Error('Skill description must be at most 1024 characters')

  const license = fields.get('license')
  return {
    name,
    description,
    ...(license ? { license } : {}),
    body: markdown.slice(match[0].length).replace(/^\r?\n/, ''),
  }
}

/** Validate the portable Agent Skills name and its folder-name contract. */
export function validateSkillName(name: string, dirName: string): void {
  if (name.length < 1 || name.length > 64) {
    throw new Error(`Invalid skill name ${JSON.stringify(name)}: must be 1–64 characters`)
  }
  if (!/^[a-z0-9-]+$/.test(name)) {
    throw new Error(`Invalid skill name ${JSON.stringify(name)}: use lowercase a-z, 0-9, and hyphens only`)
  }
  if (name.startsWith('-') || name.endsWith('-')) {
    throw new Error(`Invalid skill name ${JSON.stringify(name)}: cannot start or end with a hyphen`)
  }
  if (name.includes('--')) {
    throw new Error(`Invalid skill name ${JSON.stringify(name)}: cannot contain consecutive hyphens`)
  }
  if (name !== dirName) {
    throw new Error(`Skill name ${JSON.stringify(name)} must match directory ${JSON.stringify(dirName)}`)
  }
}

const FIXED_CENTRE_BLOCK =
  /^(<!-- fixed-centre:start[^\r\n]*-->)\r?\n([\s\S]*?)\r?\n(<!-- fixed-centre:end -->)$/m

export function extractFixedCentre(markdown: string): string {
  const match = markdown.match(FIXED_CENTRE_BLOCK)
  if (!match) throw new Error('Skill is missing the fixed-centre markers')
  return match[2]
}

export function stampFixedCentre(markdown: string, centre: string): string {
  if (!FIXED_CENTRE_BLOCK.test(markdown)) throw new Error('Skill is missing the fixed-centre markers')
  return markdown.replace(FIXED_CENTRE_BLOCK, `$1\n${centre}\n$3`)
}

/**
 * The index that rides in load_skill's description — the ONLY place the assistant
 * sees which practices exist, since Claude Desktop never reads the skill resources
 * on its own. It carries each description WHOLE, trigger clause included: a
 * filesystem client activates a skill by matching "Use when…" against the moment,
 * and the loader has to make the same judgement from the same words. Descriptions
 * are pruned to one trigger per branch precisely because they are always loaded.
 */
export function skillIndex(skills: readonly Pick<ParsedSkill, 'name' | 'description'>[]): string {
  return skills.map(({ name, description }) => `- ${name} — ${description}`).join('\n')
}
