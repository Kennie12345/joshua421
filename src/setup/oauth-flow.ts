import http from 'node:http'
import { execFile } from 'node:child_process'
import { google } from 'googleapis'

/**
 * The one-time Google consent flow, shared by `npm run auth` (re-auth only) and
 * `npm run setup` (the guided path, which also writes the result into .env).
 * Opens the browser, catches the redirect on localhost, and resolves with the
 * refresh token — plus the account's email address when Google includes it, so
 * setup can fill GOOGLE_USER_EMAIL without asking.
 *
 * Scopes stay deliberately minimal: read/write your own calendar events, SEND
 * mail only (never reads your inbox) — plus `openid email`, which grants no
 * data access at all; it only lets the token say which address it belongs to.
 */
const PORT = 5273
const REDIRECT_URI = `http://localhost:${PORT}`

const SCOPES = [
  'https://www.googleapis.com/auth/calendar.events',
  'https://www.googleapis.com/auth/gmail.send',
  'openid',
  'email',
]

export interface MintedTokens {
  refreshToken: string
  /** The authorised account's address, from the id_token — absent if Google omits it. */
  email?: string
}

/** Best-effort read of the email claim from a JWT id_token — never throws. */
function emailFromIdToken(idToken: string | null | undefined): string | undefined {
  if (!idToken) return undefined
  try {
    const payload = JSON.parse(Buffer.from(idToken.split('.')[1], 'base64url').toString('utf8'))
    return typeof payload.email === 'string' ? payload.email : undefined
  } catch {
    return undefined
  }
}

/**
 * Run the consent flow to completion. Prints the URL (and auto-opens it on
 * macOS), then waits for Google's redirect. Rejects on denial, a missing
 * refresh token (stale prior consent), or a failed token exchange.
 */
export function mintRefreshToken(clientId: string, clientSecret: string): Promise<MintedTokens> {
  const oauth2 = new google.auth.OAuth2(clientId, clientSecret, REDIRECT_URI)
  const authUrl = oauth2.generateAuthUrl({
    access_type: 'offline', // ask for a refresh token
    prompt: 'consent', // force re-consent so a refresh token is always returned
    scope: SCOPES,
  })

  return new Promise<MintedTokens>((resolve, reject) => {
    const finish = (fn: () => void) => {
      server.close()
      setTimeout(fn, 100)
    }

    const server = http.createServer(async (req, res) => {
      const url = new URL(req.url ?? '/', REDIRECT_URI)
      const code = url.searchParams.get('code')
      const error = url.searchParams.get('error')

      // Ignore stray requests (e.g. favicon) — keep waiting for the real callback.
      if (!code && !error) {
        res.writeHead(204).end()
        return
      }

      if (error) {
        res.writeHead(200, { 'Content-Type': 'text/plain' })
        res.end('Authorisation was denied. Return to the terminal.')
        finish(() => reject(new Error(`authorisation denied: ${error}`)))
        return
      }

      try {
        const { tokens } = await oauth2.getToken(code as string)
        res.writeHead(200, { 'Content-Type': 'text/plain' })
        res.end('joshua421: authorised. You can close this tab and return to the terminal.')
        if (tokens.refresh_token) {
          finish(() =>
            resolve({ refreshToken: tokens.refresh_token as string, email: emailFromIdToken(tokens.id_token) }),
          )
        } else {
          finish(() =>
            reject(
              new Error(
                'no refresh_token returned — revoke prior access at https://myaccount.google.com/permissions and try again',
              ),
            ),
          )
        }
      } catch (err) {
        res.writeHead(500).end('Token exchange failed; see terminal.')
        finish(() => reject(err instanceof Error ? err : new Error(String(err))))
      }
    })

    server.listen(PORT, () => {
      console.log('\nOpen this URL, choose your account, and click Allow:\n')
      console.log('   ' + authUrl + '\n')
      console.log(`Waiting for the redirect on ${REDIRECT_URI} ...`)
      if (process.platform === 'darwin') {
        execFile('open', [authUrl], () => {}) // best-effort auto-open on macOS
      }
    })
    server.on('error', reject)
  })
}
