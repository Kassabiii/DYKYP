// Spotify login with Authorization Code + PKCE.
// PKCE needs no client secret, so the whole flow (including token refresh) runs in the
// browser and the app can be hosted as static files. Tokens live in sessionStorage,
// so they disappear when the tab is closed.

const CLIENT_ID = import.meta.env.VITE_SPOTIFY_CLIENT_ID as string | undefined
const REDIRECT_URI = (import.meta.env.VITE_SPOTIFY_REDIRECT_URI as string | undefined) || window.location.origin

const SCOPES = [
  'playlist-read-private',
  'playlist-read-collaborative',
  'streaming',
  'user-read-private',
  'user-read-email',
  'user-modify-playback-state',
  'user-read-playback-state',
]

const KEY = {
  verifier: 'spotify_pkce_verifier',
  access: 'spotify_access_token',
  refresh: 'spotify_refresh_token',
  expiresAt: 'spotify_expires_at',
}

// Refresh this long before the token actually expires.
const EXPIRY_MARGIN_MS = 60_000

interface TokenResponse {
  access_token: string
  refresh_token?: string
  expires_in: number
}

let refreshInFlight: Promise<string> | null = null

function base64Url(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')
}

function saveTokens(data: TokenResponse): void {
  sessionStorage.setItem(KEY.access, data.access_token)
  sessionStorage.setItem(KEY.expiresAt, String(Date.now() + data.expires_in * 1000))
  if (data.refresh_token) sessionStorage.setItem(KEY.refresh, data.refresh_token)
}

async function requestToken(params: Record<string, string>): Promise<TokenResponse> {
  const response = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: CLIENT_ID ?? '', ...params }),
  })
  if (!response.ok) throw new Error('Spotify refused the login. Please connect again.')
  return response.json()
}

export function isConfigured(): boolean {
  return Boolean(CLIENT_ID)
}

export function hasSession(): boolean {
  return Boolean(sessionStorage.getItem(KEY.access))
}

export async function startLogin(): Promise<void> {
  if (!CLIENT_ID) throw new Error('Missing VITE_SPOTIFY_CLIENT_ID. Add it to .env.local (or your host settings).')

  const verifier = base64Url(crypto.getRandomValues(new Uint8Array(64)))
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier))
  sessionStorage.setItem(KEY.verifier, verifier)

  const params = new URLSearchParams({
    client_id: CLIENT_ID,
    response_type: 'code',
    redirect_uri: REDIRECT_URI,
    code_challenge_method: 'S256',
    code_challenge: base64Url(new Uint8Array(digest)),
    scope: SCOPES.join(' '),
  })
  window.location.assign(`https://accounts.spotify.com/authorize?${params}`)
}

/**
 * If the page was opened by Spotify's redirect, finish the login.
 * Returns true when a login was completed, false when there was nothing to do.
 */
export async function completeLoginFromUrl(): Promise<boolean> {
  const query = new URLSearchParams(window.location.search)
  const code = query.get('code')
  const denied = query.get('error')
  if (!code && !denied) return false

  // Remove ?code= from the address bar whatever happens next.
  window.history.replaceState({}, '', window.location.pathname)

  if (denied) throw new Error('Spotify access was not granted.')

  const verifier = sessionStorage.getItem(KEY.verifier)
  if (!verifier) throw new Error('Your login session expired. Please connect again.')

  saveTokens(
    await requestToken({
      grant_type: 'authorization_code',
      code: code!,
      redirect_uri: REDIRECT_URI,
      code_verifier: verifier,
    }),
  )
  sessionStorage.removeItem(KEY.verifier)
  return true
}

async function refresh(): Promise<string> {
  const refreshToken = sessionStorage.getItem(KEY.refresh)
  if (!refreshToken) throw new Error('Your Spotify session expired. Please connect again.')
  saveTokens(await requestToken({ grant_type: 'refresh_token', refresh_token: refreshToken }))
  return sessionStorage.getItem(KEY.access)!
}

/** Always returns a usable access token, refreshing it first when it is about to expire. */
export async function getAccessToken(forceRefresh = false): Promise<string> {
  const token = sessionStorage.getItem(KEY.access)
  const expiresAt = Number(sessionStorage.getItem(KEY.expiresAt) ?? 0)
  if (token && !forceRefresh && Date.now() < expiresAt - EXPIRY_MARGIN_MS) return token

  // Several requests may notice the expiry at once; share one refresh between them.
  refreshInFlight ??= refresh().finally(() => {
    refreshInFlight = null
  })
  return refreshInFlight
}

export function logout(): void {
  Object.values(KEY).forEach((key) => sessionStorage.removeItem(key))
}
