import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { createRequire } from 'node:module'

/**
 * Small shared helpers for the two generators (setup wizard, worker installer):
 * where the repo is, where tsx's CLI is, and how to embed an absolute path in a
 * generated shell script safely. Centralised so the shell-quoting rule can't
 * drift between the launcher and the launchd plist.
 */

/** The repo root, resolved by THIS file's location (never cwd — MCP/launchd both
 *  spawn with an unpredictable working directory). */
export const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..')

/** Absolute path to tsx's CLI entry, so a generated launcher never relies on PATH. */
export function resolveTsxCli(): string {
  try {
    return createRequire(import.meta.url).resolve('tsx/cli')
  } catch {
    return join(repoRoot, 'node_modules/tsx/dist/cli.mjs')
  }
}

/**
 * POSIX single-quote a string for safe interpolation into an sh command. Double
 * quotes would still expand $, `…`, and \ — so a repo path containing any of
 * those (or a space) could break or, worse, inject into the generated script.
 * Single quotes disable ALL expansion; the only escape needed is the closing
 * quote itself, done the standard '\'' way.
 */
export function shQuote(s: string): string {
  return `'${s.replace(/'/g, `'\\''`)}'`
}

/** XML-escape a value for safe insertion into a launchd .plist (paths are data). */
export function xmlEscape(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}
