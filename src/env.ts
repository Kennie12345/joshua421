import { fileURLToPath } from 'node:url'
import { dirname, isAbsolute, join } from 'node:path'
import dotenv from 'dotenv'

/**
 * Resolve everything relative to THIS file, never the process cwd. Claude
 * Desktop (and other MCP hosts) spawn the server with an unpredictable working
 * directory, so cwd-relative paths can't be trusted — a cwd-relative
 * ./cairn.sqlite is exactly what produced SQLITE_CANTOPEN on first launch.
 *
 * Import this FIRST in every entrypoint, before anything reads env or opens the
 * cairn. `quiet: true` keeps dotenv from printing a banner that would corrupt
 * the MCP stdio channel.
 */
const here = dirname(fileURLToPath(import.meta.url)) // .../src
const repoRoot = join(here, '..')

dotenv.config({ path: join(repoRoot, '.env'), quiet: true })

// Pin the cairn DB to an absolute path so it opens regardless of cwd.
const db = process.env.CAIRN_DB_PATH ?? 'cairn.sqlite'
process.env.CAIRN_DB_PATH = isAbsolute(db) ? db : join(repoRoot, db)
