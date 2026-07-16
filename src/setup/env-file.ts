import { chmod, readFile, writeFile } from 'node:fs/promises'

/**
 * Update keys in a dotenv file IN PLACE — the setup wizard writes what it minted
 * (client id/secret, refresh token, calendar id) instead of asking the user to
 * hand-paste. Existing lines keep their position and every comment survives, so
 * the file stays the annotated .env.example the user can still read; keys the
 * file doesn't have yet are appended at the end.
 */
export async function updateEnvFile(path: string, updates: Record<string, string>): Promise<void> {
  let text: string
  try {
    text = await readFile(path, 'utf8')
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err
    text = ''
  }

  const remaining = new Map(Object.entries(updates))
  const lines = text.split('\n').map((line) => {
    const m = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=/.exec(line)
    if (!m) return line
    const value = remaining.get(m[1])
    if (value === undefined) return line
    remaining.delete(m[1])
    return `${m[1]}=${value}`
  })

  let out = lines.join('\n')
  if (remaining.size > 0) {
    if (out.length > 0 && !out.endsWith('\n')) out += '\n'
    out += [...remaining].map(([k, v]) => `${k}=${v}`).join('\n') + '\n'
  }
  await writeFile(path, out, 'utf8')
  // A dotenv file holds the refresh token and client secret — keep it owner-only
  // (0600) rather than the default 0644, so it isn't world-readable on a shared box.
  await chmod(path, 0o600).catch(() => {})
}
