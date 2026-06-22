#!/usr/bin/env node
/**
 * Re-mint a Google Sheets refresh token via the OAuth installed-app flow.
 *
 * Use this whenever:
 *   - The current refresh token has been revoked (Settings → Google
 *     Sheets shows "Refresh token: Invalid ✗").
 *   - You're setting up a new deployment and need a fresh token.
 *
 * How it works:
 *   1. Reads VITE_GOOGLE_SHEETS_CLIENT_ID / _CLIENT_SECRET / _REDIRECT_URI
 *      from .env.
 *   2. Starts a tiny local HTTP server on the redirect-URI's port (3000
 *      by default).
 *   3. Opens Google's consent screen in your browser. Sign in with the
 *      account that has view access to the 2026 Project Management
 *      spreadsheet (the "Firebrake" account, per your runbook).
 *   4. Google bounces the browser back to /oauth2callback with an
 *      authorization code.
 *   5. The script exchanges the code for a refresh_token and prints it.
 *
 * Pre-flight checklist:
 *   - The redirect URI in .env MUST match a redirect URI registered for
 *     this OAuth client in https://console.cloud.google.com/apis/credentials.
 *     If you see "redirect_uri_mismatch" in the browser, that's why.
 *   - You'll only get a refresh_token back if Google considers this a
 *     FIRST consent for this (client, account) pair. If you've granted
 *     access before, revoke at https://myaccount.google.com/permissions
 *     first, then re-run.
 */

import http from 'node:http'
import { exec } from 'node:child_process'
import { readFileSync } from 'node:fs'
import path from 'node:path'

const ENV_PATH = path.resolve(process.cwd(), '.env')
const SCOPES =
  'https://www.googleapis.com/auth/spreadsheets https://www.googleapis.com/auth/drive.readonly'

function readEnvFile() {
  let raw = ''
  try {
    raw = readFileSync(ENV_PATH, 'utf8')
  } catch (e) {
    console.error(`Could not read ${ENV_PATH}:`, e.message)
    process.exit(1)
  }
  const env = {}
  for (const line of raw.split('\n')) {
    if (!line || line.startsWith('#')) continue
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.+?)\s*$/)
    if (m) env[m[1]] = m[2]
  }
  return env
}

const env = readEnvFile()
const clientId = env.VITE_GOOGLE_SHEETS_CLIENT_ID
const clientSecret = env.VITE_GOOGLE_SHEETS_CLIENT_SECRET
const redirectUri =
  env.VITE_GOOGLE_SHEETS_REDIRECT_URI || 'http://localhost:3000/oauth2callback'

if (!clientId || !clientSecret) {
  console.error(
    'Missing VITE_GOOGLE_SHEETS_CLIENT_ID or VITE_GOOGLE_SHEETS_CLIENT_SECRET in .env',
  )
  process.exit(1)
}

let redirectUrl
try {
  redirectUrl = new URL(redirectUri)
} catch {
  console.error(`Invalid VITE_GOOGLE_SHEETS_REDIRECT_URI: ${redirectUri}`)
  process.exit(1)
}
const PORT = Number(redirectUrl.port) || 3000

const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth')
authUrl.searchParams.set('client_id', clientId)
authUrl.searchParams.set('redirect_uri', redirectUri)
authUrl.searchParams.set('response_type', 'code')
authUrl.searchParams.set('scope', SCOPES)
authUrl.searchParams.set('access_type', 'offline')
authUrl.searchParams.set('prompt', 'consent')

console.log('\n═══════════════════════════════════════════════════════════════════════')
console.log('  Google Sheets OAuth — refresh-token setup')
console.log('═══════════════════════════════════════════════════════════════════════\n')
console.log(`Client ID:    ${clientId}`)
console.log(`Redirect URI: ${redirectUri}`)
console.log(`Scopes:       ${SCOPES}\n`)

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`)
  if (url.pathname !== redirectUrl.pathname) {
    res.writeHead(404, { 'Content-Type': 'text/plain' })
    res.end('Not the OAuth callback path')
    return
  }
  const code = url.searchParams.get('code')
  const err = url.searchParams.get('error')
  if (err) {
    res.writeHead(400, { 'Content-Type': 'text/plain' })
    res.end(`Authorization error: ${err}`)
    console.error(`\n❌ Authorization error from Google: ${err}`)
    console.error(
      "Common causes: you cancelled the consent screen, or the redirect URI in this script doesn't match what's registered in the Google Cloud Console for this OAuth client.",
    )
    server.close()
    process.exit(1)
    return
  }
  if (!code) {
    res.writeHead(400, { 'Content-Type': 'text/plain' })
    res.end('Missing code parameter')
    return
  }

  console.log('✓ Received authorization code from Google')
  console.log('  Exchanging for refresh token…\n')

  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uri: redirectUri,
  })

  try {
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    })
    const data = await tokenRes.json()
    if (!tokenRes.ok) {
      console.error('❌ Token exchange failed:', data)
      res.writeHead(500, { 'Content-Type': 'text/plain' })
      res.end('Token exchange failed — see terminal')
      server.close()
      process.exit(1)
      return
    }
    if (!data.refresh_token) {
      console.error('❌ No refresh_token in the response.\n')
      console.error(
        'Google only issues a refresh_token on the FIRST consent for this (client, account) pair.',
      )
      console.error(
        'Revoke the existing grant at https://myaccount.google.com/permissions',
      )
      console.error('then run this script again.\n')
      res.writeHead(500, { 'Content-Type': 'text/plain' })
      res.end('No refresh token in response — see terminal')
      server.close()
      process.exit(1)
      return
    }

    console.log('═══════════════════════════════════════════════════════════════════════')
    console.log('  ✅ SUCCESS — new refresh token issued')
    console.log('═══════════════════════════════════════════════════════════════════════\n')
    console.log('Update this line in .env:\n')
    console.log(`  VITE_GOOGLE_SHEETS_REFRESH_TOKEN=${data.refresh_token}\n`)
    console.log(
      'Then restart the dev server (Ctrl+C in the npm run dev terminal, then re-run it).',
    )
    console.log(
      'For Railway: also update VITE_GOOGLE_SHEETS_REFRESH_TOKEN in the Variables tab and redeploy.\n',
    )

    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
    res.end(`<!doctype html><html><head><meta charset="utf-8"><title>Google Sheets re-authorized</title>
      <style>
        body{font-family:system-ui,-apple-system,sans-serif;padding:40px;max-width:640px;margin:0 auto;background:#0a0a0a;color:#e5e5e5;line-height:1.5}
        h2{color:#22c55e;margin-top:0}
        code{background:#1f1f1f;padding:2px 6px;border-radius:4px;font-size:0.9em}
        p{color:#a3a3a3}
      </style></head><body>
      <h2>✅ Google Sheets re-authorized</h2>
      <p>The new refresh token has been printed in the terminal where you ran the script.</p>
      <p>Copy the line that starts with <code>VITE_GOOGLE_SHEETS_REFRESH_TOKEN=</code> into your <code>.env</code> file, then restart the dev server.</p>
      <p>You can close this tab.</p>
      </body></html>`)

    server.close(() => process.exit(0))
  } catch (e) {
    console.error('❌ Token exchange error:', e?.message || e)
    res.writeHead(500, { 'Content-Type': 'text/plain' })
    res.end('Token exchange error — see terminal')
    server.close()
    process.exit(1)
  }
})

server.on('error', (e) => {
  if (e.code === 'EADDRINUSE') {
    console.error(`\n❌ Port ${PORT} is already in use.`)
    console.error(
      "Kill whatever's holding it (often the production `npm start` server) and re-run.\n",
    )
    process.exit(1)
    return
  }
  console.error('Server error:', e)
  process.exit(1)
})

server.listen(PORT, () => {
  console.log(`Local OAuth callback server listening on port ${PORT}.`)
  console.log("Opening Google's consent screen in your browser…\n")
  console.log("If it doesn't open automatically, paste this URL into your browser:\n")
  console.log(`  ${authUrl.toString()}\n`)
  console.log(
    '⚠️  Sign in with the Firebrake Google account (the one with view access to the 2026 Project Management spreadsheet).',
  )
  console.log(
    "    If you've previously granted this app access, revoke it first at https://myaccount.google.com/permissions",
  )
  console.log('    otherwise Google may not return a fresh refresh_token.\n')

  const target = authUrl.toString().replace(/"/g, '%22')
  const cmd =
    process.platform === 'darwin'
      ? `open "${target}"`
      : process.platform === 'win32'
        ? `start "" "${target}"`
        : `xdg-open "${target}"`
  exec(cmd, () => {
    // Swallow — falling back to the printed URL is fine.
  })
})
