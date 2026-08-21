import { fileURLToPath } from 'node:url'
import { dirname, isAbsolute, join } from 'node:path'
import dotenv from 'dotenv'

/**
 * Resolve everything relative to THIS file, never the process cwd. Claude
 * Desktop (and other MCP hosts) spawn the server with an unpredictable working
 * directory, so cwd-relative paths can't be trusted — a cwd-relative DB path is
 * exactly what produced SQLITE_CANTOPEN on first launch.
 *
 * Import this FIRST in every entrypoint, before anything reads env or opens the
 * log. `quiet: true` keeps dotenv from printing a banner that would corrupt the
 * MCP stdio channel.
 */
const here = dirname(fileURLToPath(import.meta.url)) // .../src
export const REPO_ROOT = join(here, '..')

dotenv.config({ path: join(REPO_ROOT, '.env'), quiet: true })

// Pin the LEGACY local stores to absolute paths so `npm run migrate` (and the
// pre-cutover fallback checks) find them regardless of cwd. Since the
// calendar-as-database cutover these are migration sources, not live stores.
const db = process.env.JOSHUA421_DB ?? 'joshua421.sqlite'
process.env.JOSHUA421_DB = isAbsolute(db) ? db : join(REPO_ROOT, db)

const grounding = process.env.GROUNDING_PATH ?? 'grounding.md'
process.env.GROUNDING_PATH = isAbsolute(grounding) ? grounding : join(REPO_ROOT, grounding)
