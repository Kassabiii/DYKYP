// Thin wrapper around the Spotify Web API (metadata and playback commands, never audio).

import { getAccessToken } from './auth'

const API = 'https://api.spotify.com/v1'

// Keep huge playlists from making the game slow to start.
const MAX_PLAYLISTS = 200
const MAX_TRACKS = 1000

export interface Playlist {
  id: string
  name: string
  owner: string
  image?: string
  total: number
}

export interface Track {
  id: string
  uri: string
  name: string
  artists: string[]
  durationMs: number
  image?: string
}

export interface Profile {
  name: string
  /** "premium", "free", or undefined when Spotify does not share it. */
  product?: string
}

export class SpotifyError extends Error {
  readonly status: number

  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

interface Page<T> {
  items: T[]
  next: string | null
}

/** Sends a request, retrying once with a fresh token if Spotify says the old one expired. */
export async function spotifyFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const url = path.startsWith('http') ? path : `${API}${path}`

  const send = async (token: string) =>
    fetch(url, {
      ...init,
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        ...init.headers,
      },
    })

  let response = await send(await getAccessToken())
  if (response.status === 401) response = await send(await getAccessToken(true))

  if (!response.ok) {
    let message = `Spotify request failed (${response.status}).`
    try {
      const body = await response.json()
      if (body?.error?.message) message = body.error.message
    } catch {
      // Keep the generic message.
    }
    throw new SpotifyError(response.status, message)
  }

  // 204 No Content and empty 200s are both normal for playback commands.
  const text = await response.text()
  return (text ? JSON.parse(text) : undefined) as T
}

async function collectPages<Raw, Out>(firstPath: string, map: (raw: Raw) => Out | null, limit: number): Promise<Out[]> {
  const results: Out[] = []
  let next: string | null = firstPath

  while (next && results.length < limit) {
    const page: Page<Raw> = await spotifyFetch<Page<Raw>>(next)
    for (const raw of page.items) {
      const item = map(raw)
      if (item) results.push(item)
    }
    next = page.next
  }
  return results.slice(0, limit)
}

export async function getProfile(): Promise<Profile> {
  const me = await spotifyFetch<{ display_name?: string; id: string; product?: string }>('/me')
  return { name: me.display_name || me.id, product: me.product }
}

// Raw Spotify JSON is loosely typed below; only the fields we read are mapped.
export function getPlaylists(): Promise<Playlist[]> {
  return collectPages<any, Playlist>(
    '/me/playlists?limit=50',
    (p) =>
      p && {
        id: p.id,
        name: p.name,
        owner: p.owner?.display_name ?? 'Spotify',
        image: p.images?.[0]?.url,
        // Newer API responses use "items", older ones "tracks".
        total: p.items?.total ?? p.tracks?.total ?? 0,
      },
    MAX_PLAYLISTS,
  )
}

/** Returns the playable songs of a playlist. Local files and podcast episodes are skipped. */
export async function getPlaylistTracks(playlistId: string): Promise<Track[]> {
  const tracks = await collectPages<any, Track>(
    `/playlists/${playlistId}/items?limit=100`,
    (entry) => {
      const t = entry?.item ?? entry?.track
      if (!t || t.type !== 'track' || t.is_local || !t.uri || !t.id) return null
      return {
        id: t.id,
        uri: t.uri,
        name: t.name,
        artists: (t.artists ?? []).map((a: any) => a.name),
        durationMs: t.duration_ms,
        image: t.album?.images?.[0]?.url,
      }
    },
    MAX_TRACKS,
  )

  // The same song can appear twice in a playlist; keep one copy.
  const seen = new Set<string>()
  return tracks.filter((t) => !seen.has(t.id) && seen.add(t.id))
}
