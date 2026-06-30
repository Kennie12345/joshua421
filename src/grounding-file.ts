import { readFile, writeFile } from 'node:fs/promises'
import type { Grounding } from './core/grounding'

/**
 * File-backed grounding — a plain markdown file of the user's preferences, which
 * they own and can even edit by hand. Path from GROUNDING_PATH (resolved to
 * absolute in env.ts). Gitignored, because it holds the user's own content.
 */
export function makeFileGrounding(
  path = process.env.GROUNDING_PATH ?? './grounding.md',
): Grounding {
  return {
    async get(): Promise<string | null> {
      try {
        const text = (await readFile(path, 'utf8')).trim()
        return text.length > 0 ? text : null
      } catch (err) {
        if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null
        throw err
      }
    },

    async set(preferences: string): Promise<void> {
      await writeFile(path, `${preferences.trim()}\n`, 'utf8')
    },
  }
}
