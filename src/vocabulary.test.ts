import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { REPO_ROOT } from './env'
import { COMPANION_INSTRUCTIONS, INDUCTION } from './core/persona'
import { centreBreath } from './core/centre'
import { loadSkills } from './adapters/skills-fs'

/**
 * The glossary (docs/glossary.md) fixes the words; this is where it becomes enforceable.
 *
 * Only two terms are pinned, and deliberately so: they are the ones the product kept
 * reaching for, because they are what a stranger would say. "Goals" turns an Intention —
 * something asked of God — into something to hit, and "preferences" turns a Grounding
 * into a settings screen. Both had leaked into the persona, the tool descriptions, the
 * induction and the Practices before anyone noticed.
 *
 * PARSERS ARE EXEMPT and are not scanned: a person's own grounding may well be headed
 * "Goals", and cadence.ts has to keep reading it. The rule binds what joshua421 SAYS,
 * never what it is willing to HEAR.
 */
const BANNED = [
  { pattern: /\bgoals?\b/i, instead: 'Intention' },
  { pattern: /\bpreferences?\b/i, instead: 'Grounding' },
] as const

const DOCS = ['README.md', 'docs/design.md', 'docs/status.md', 'docs/setup.md'] as const

const authored = () => {
  const skills = loadSkills().map((skill) => [`skills/${skill.name}/SKILL.md`, skill.markdown] as const)
  return [
    ['persona: COMPANION_INSTRUCTIONS', COMPANION_INSTRUCTIONS],
    ['persona: INDUCTION', INDUCTION],
    ['the centre', centreBreath()],
    // The tool descriptions live in the entrypoint, and they are where the drift was
    // worst — eleven of the fourteen slips. Scanned as source, since they are composed
    // inline at registration and cannot be imported.
    ['src/mcp.ts', readFileSync(join(REPO_ROOT, 'src/mcp.ts'), 'utf8')],
    ...skills,
    // The docs teach the words to everyone who reads them, so they are bound too.
    // docs/glossary.md is exempt (it must print the banned words to ban them) and so
    // is docs/adr/ — an ADR records what was decided when, and is not rewritten to
    // match language that moved after it.
    ...DOCS.map((doc) => [doc, readFileSync(join(REPO_ROOT, doc), 'utf8')] as const),
  ] as const
}

test('nothing joshua421 says calls an Intention a goal, or a Grounding a preference', () => {
  for (const [surface, text] of authored()) {
    for (const { pattern, instead } of BANNED) {
      const hit = text.match(pattern)
      assert.equal(
        hit,
        null,
        `${surface}: says "${hit?.[0]}" — the glossary's word is ${instead} (docs/glossary.md)`,
      )
    }
  }
})

test('every Practice carries the Intention wording, so the centre is not quietly re-typed', () => {
  for (const skill of loadSkills()) {
    assert.ok(
      skill.markdown.includes('or an intention they actually named'),
      `${skill.name}: the stamped centre is stale — run npm run skills:build`,
    )
  }
})
