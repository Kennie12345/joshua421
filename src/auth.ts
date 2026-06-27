import 'dotenv/config'
import http from 'node:http'
import { execFile } from 'node:child_process'
import { google } from 'googleapis'

/**
 * One-time Google consent flow. Run `npm run auth`, click Allow in the browser,
 * and this prints your GOOGLE_REFRESH_TOKEN to paste into .env. Run once.
 *
 * Scopes are deliberately minimal: read/write your own calendar events, and
 * SEND mail only — joshua421 never gains permission to read your inbox.
 */
const PORT = 5273
const REDIRECT_URI = `http://localhost:${PORT}`

const SCOPES = [
  'https://www.googleapis.com/auth/calendar.events',
  'https://www.googleapis.com/auth/gmail.send',
]

const clientId = process.env.GOOGLE_CLIENT_ID
const clientSecret = process.env.GOOGLE_CLIENT_SECRET
if (!clientId || !clientSecret) {
  console.error('Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in .env first.')
  process.exit(1)
}

const oauth2 = new google.auth.OAuth2(clientId, clientSecret, REDIRECT_URI)

const authUrl = oauth2.generateAuthUrl({
  access_type: 'offline', // ask for a refresh token
  prompt: 'consent', // force re-consent so a refresh token is always returned
  scope: SCOPES,
})

function shutdown(code: number) {
  server.close()
  setTimeout(() => process.exit(code), 100)
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
    console.error(`\nAuthorisation error: ${error}`)
    shutdown(1)
    return
  }

  try {
    const { tokens } = await oauth2.getToken(code as string)
    res.writeHead(200, { 'Content-Type': 'text/plain' })
    res.end('joshua421: authorised. You can close this tab and return to the terminal.')

    if (tokens.refresh_token) {
      console.log('\n  GOOGLE_REFRESH_TOKEN=' + tokens.refresh_token + '\n')
      console.log('Paste that line into your .env. Done.')
      shutdown(0)
    } else {
      console.error('\nNo refresh_token returned. Revoke prior access at')
      console.error('https://myaccount.google.com/permissions and run `npm run auth` again.')
      shutdown(1)
    }
  } catch (err) {
    res.writeHead(500).end('Token exchange failed; see terminal.')
    console.error(err)
    shutdown(1)
  }
})

server.listen(PORT, () => {
  console.log('joshua421 · one-time Google authorisation\n')
  console.log('Open this URL, choose your account, and click Allow:\n')
  console.log('   ' + authUrl + '\n')
  console.log(`Waiting for the redirect on ${REDIRECT_URI} ...`)
  if (process.platform === 'darwin') {
    execFile('open', [authUrl], () => {}) // best-effort auto-open on macOS
  }
})
