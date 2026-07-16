import '../env'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { mintRefreshToken } from './oauth-flow'
import { updateEnvFile } from './env-file'

/**
 * Re-run the Google consent flow and write the fresh refresh token straight
 * into .env. `npm run setup` is the guided first-time path; this is the short
 * command for when a token expires or is revoked. Run once, click Allow, done.
 */
const clientId = process.env.GOOGLE_CLIENT_ID
const clientSecret = process.env.GOOGLE_CLIENT_SECRET
if (!clientId || !clientSecret) {
  console.error('Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in .env first — or run `npm run setup`.')
  process.exit(1)
}

// Same file-location (not cwd) resolution as env.ts — .env sits at the repo root.
const envPath = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '.env')

console.log('joshua421 · Google authorisation')

mintRefreshToken(clientId, clientSecret)
  .then(async ({ refreshToken, email }) => {
    const updates: Record<string, string> = { GOOGLE_REFRESH_TOKEN: refreshToken }
    if (email && !process.env.GOOGLE_USER_EMAIL) updates.GOOGLE_USER_EMAIL = email
    await updateEnvFile(envPath, updates)
    console.log(`\nAuthorised${email ? ` as ${email}` : ''}. Refresh token written to .env. Done.`)
    process.exit(0)
  })
  .catch((err) => {
    console.error(`\n${err instanceof Error ? err.message : err}`)
    process.exit(1)
  })
