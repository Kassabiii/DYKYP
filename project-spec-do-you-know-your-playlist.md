# Project Specification: "Do You Know Your Playlist?"

## 1. Overview

Build a web application that is a Spotify-integrated variant of the "guess the song from a short audio snippet" game genre (inspired by songless-style games). Instead of a curated daily song pool, this game pulls tracks **directly from the logged-in user's own Spotify playlist**, so the user is guessing songs from their own library rather than a shared/global pool.

**Core loop:** the app plays an increasingly long snippet of a randomly selected track from the user's chosen playlist (starting at 0.1 seconds, escalating on wrong guesses/skips through 1s, 2s, 5s, 8s), and the user must type the correct song title (autocomplete-assisted, scoped only to that playlist's tracks) before running out of guess tiers.

## 2. Goals

- Single-player, browser-based, no native app
- Login via Spotify OAuth (user must have a Spotify account; **Spotify Premium is required** for audio playback — see constraints)
- User selects one of their own playlists to play against
- Game randomly selects tracks from that playlist, plays escalating snippets, and scores based on how early the user guesses correctly
- No persistent backend database required for MVP — game state lives client-side per session

## 3. Non-Goals (for MVP)

- No multiplayer / real-time competitive mode
- No global leaderboard or persistent user accounts beyond the Spotify session
- No custom audio hosting or pre-processing of tracks — playback is done live via Spotify's own player, not by downloading/clipping audio files
- No support for non-Premium Spotify accounts (playback API constraint, explained below)

## 4. Critical Technical Constraint (read first)

Spotify deprecated the `preview_url` field (30-second static MP3 previews) for most tracks as of late 2024/2025 — it is no longer reliably available via the standard Web API `GET /tracks` endpoint. This rules out the "simplest" approach of just fetching a preview URL and playing it in an `<audio>` tag.

**The only reliable way to play snippets of arbitrary tracks from a user's real playlist today is via the Spotify Web Playback SDK**, which requires:
- The user to be logged in with a **Spotify Premium** account
- The `streaming` and `user-modify-playback-state` OAuth scopes
- A live "Spotify Connect" device session created by the SDK in-browser

This means: non-Premium users can authenticate and browse playlists, but cannot play snippets. This limitation must be surfaced clearly in the UI (e.g., a check after login: if the SDK reports the account isn't Premium, show a message rather than silently failing).

## 5. User Flow

1. Landing page → "Login with Spotify" button
2. OAuth redirect → user grants permissions → redirected back with auth code
3. Backend (or client, if using PKCE fully client-side) exchanges code for access + refresh tokens
4. App checks account type; if non-Premium, show a blocking message explaining Premium is required for playback
5. App fetches user's playlists (`GET /me/playlists`), displays them as a selectable list (with cover art, name, track count)
6. User picks a playlist → app fetches its tracks (`GET /playlists/{id}/tracks`), filtering out local files/podcast episodes/tracks with null `track` objects
7. Game session begins:
   a. Pick a random track from the fetched list
   b. Fetch track duration, compute a random start timestamp avoiding first/last ~15% of the track (to dodge silence/fade in-out)
   c. Initialize the Web Playback SDK player and Spotify Connect device if not already active
   d. Play the track at the chosen start position, then pause it after the current tier's duration (100ms → 1000ms → 2000ms → 5000ms → 8000ms)
   e. Present an autocomplete text input scoped ONLY to track names from the selected playlist (client-side fuzzy match, not a Spotify search API call)
   f. On correct guess: award points based on which tier it was guessed at (earlier tier = more points), reveal track info, move to next round
   g. On incorrect guess or explicit "skip": advance to the next tier and replay from the same start position with the longer duration
   h. If the user fails all tiers (including full 8s), reveal the answer, award 0 points, move to next round
8. After N rounds (configurable, e.g. 5 or 10), show a summary screen with total score and list of correct/incorrect answers

## 6. Architecture

### 6.1 High-level components

- **Frontend SPA**: Vue 3 + TypeScript + Vite + Pinia (state management) + Tailwind CSS
- **Thin backend**: Node.js + Express, used ONLY for OAuth token exchange and refresh (to avoid exposing the Spotify client secret in the browser) — no database, no persistent storage needed for MVP
- **Spotify Web Playback SDK**: loaded client-side, handles actual audio playback and device registration
- **Spotify Web API**: used for playlist/track metadata fetching (not for audio)

### 6.2 Auth flow (Authorization Code with PKCE)

```
Frontend generates code_verifier + code_challenge
  → redirect to https://accounts.spotify.com/authorize
    with client_id, redirect_uri, code_challenge, scopes
  → Spotify redirects back to redirect_uri with `code`
  → Frontend (or backend) POSTs to https://accounts.spotify.com/api/token
    exchanging `code` + `code_verifier` for access_token + refresh_token
  → Store access_token in memory (Pinia store), refresh_token in httpOnly cookie
    (if using a backend) or secure storage
  → Backend endpoint /refresh silently renews access_token before expiry
```

Required scopes: `playlist-read-private`, `playlist-read-collaborative`, `streaming`, `user-read-email`, `user-read-private`, `user-modify-playback-state`, `user-read-playback-state`.

### 6.3 Playback engine

```javascript
const player = new Spotify.Player({
  name: 'Do You Know Your Playlist',
  getOAuthToken: cb => cb(currentAccessToken)
});

player.addListener('ready', ({ device_id }) => {
  // store device_id, this is now our playback target
});

player.connect();

async function playSnippet(trackUri, startMs, durationMs, deviceId, accessToken) {
  await fetch(`https://api.spotify.com/v1/me/player/play?device_id=${deviceId}`, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ uris: [trackUri], position_ms: startMs })
  });

  setTimeout(() => player.pause(), durationMs);
}
```

Notes for implementation:
- Playback commands are REST calls against `/me/player/play`, `/me/player/pause` targeting the SDK-registered `device_id`
- If the user has an active Spotify session elsewhere (phone, desktop app), playback may need an explicit device transfer call (`PUT /me/player` with `device_ids: [device_id]`) before the game's device takes over
- Browser autoplay restrictions may require the SDK player to be initialized after a user gesture (e.g., the "Login" or "Start game" button click) rather than on page load

### 6.4 Game state (client-side, Pinia store)

```typescript
interface GameSession {
  playlistId: string;
  tracks: TrackMeta[];           // filtered, minimal metadata for the whole playlist
  currentRoundIndex: number;
  currentTrack: TrackMeta | null;
  roundStartMs: number;
  currentTier: number;           // index into [100, 1000, 2000, 5000, 8000]
  score: number;
  roundHistory: RoundResult[];
}

interface TrackMeta {
  uri: string;
  name: string;
  artists: string[];
  durationMs: number;
}

interface RoundResult {
  track: TrackMeta;
  guessedCorrectly: boolean;
  tierGuessedAt: number | null;  // null if never guessed
  pointsAwarded: number;
}
```

### 6.5 Autocomplete/guessing UI

- Do NOT call Spotify's search API for guesses — scope matching entirely to the already-fetched playlist track list (avoids irrelevant results and keeps guessing fair/bounded)
- Client-side fuzzy matching library (e.g., Fuse.js) against `name` + `artists` fields
- Display top 5-8 matches as the user types, selectable

## 7. Scoring model (suggested, adjustable)

| Tier guessed at | Points |
|---|---|
| 0.1s | 100 |
| 1s | 80 |
| 2s | 60 |
| 5s | 40 |
| 8s | 20 |
| Never (revealed) | 0 |

## 8. Edge cases to handle explicitly

- Non-Premium account → block playback, show explanation
- Empty or very small playlist (< 5 tracks) → warn user, possibly disallow starting a game
- Playlist containing local files (`is_local: true`) → filter out, since these have no playable Spotify URI
- Podcast episodes in a playlist → filter out (check `track.type === 'track'`)
- Access token expiry mid-game → silent refresh via backend `/refresh` endpoint, retry the failed request once
- No active Spotify Connect device / playback transfer failure → show a retry/reconnect prompt
- Track duration too short for the random-start logic to leave meaningful room (e.g., < 20s track) → fall back to starting near the beginning

## 9. Suggested build order (for incremental development)

1. Spotify app registration + OAuth PKCE flow working end-to-end (login → token in hand)
2. Playlist fetch + selection UI (no playback yet, just confirm data flow)
3. Web Playback SDK integration: get a device_id registered, confirm you can play/pause a hardcoded track
4. Snippet timing logic: random start position + tiered pause durations
5. Autocomplete guess UI scoped to the playlist
6. Round/score state machine wiring it all together
7. Edge case handling (non-Premium, expired tokens, empty playlists)
8. Styling/polish pass

## 10. Explicitly out of scope unless requested later

- Persistent user accounts / history across sessions
- Multiplayer or async challenge-a-friend mode
- Server-side caching of playlist data
- Mobile-native wrapper (Web Playback SDK has limited mobile browser support — this is a desktop-browser-first product for now)

---

**End of specification.** This document should be treated as the authoritative source of scope and constraints for this project. Any deviation (e.g., attempting to use `preview_url` instead of the Web Playback SDK) should be flagged back to the requester rather than silently substituted, since it directly affects which accounts (Premium vs free) can use the finished product.
