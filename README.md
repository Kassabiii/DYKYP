# Do You Know Your Playlist?

A guess-the-song game played on your own Spotify playlist. You hear **0.1 s** of a song.
Name it, or skip (a wrong guess also counts as a skip), and the clip gets longer:
0.1 s → 0.5 s → 1 s → 2 s → 4 s → 8 s. The faster you get it, the more points you score.

Built with Vue 3, TypeScript, Vite and the Spotify Web Playback SDK. Static site, no backend.

## How it is organised

| File | What it does |
| --- | --- |
| `src/lib/auth.ts` | Spotify login (PKCE) and silent token refresh, all in the browser |
| `src/lib/spotifyApi.ts` | Profile, playlists and playlist songs from the Web API |
| `src/lib/snippetPlayer.ts` | Plays exact-length clips through the Web Playback SDK |
| `src/game/rules.ts` | Clip lengths, points, answer matching, shuffling |
| `src/game/useGame.ts` | Round state machine: loading → ready ⇄ playing → revealed |
| `src/views/*` | The four screens: welcome, playlists, game, results |

To change clip lengths or points, edit `TIERS_MS` and `POINTS` in `src/game/rules.ts`.

## Run locally

1. Create an app in the [Spotify Developer Dashboard](https://developer.spotify.com/dashboard).
   Tick **Web API** and **Web Playback SDK**, and add `http://127.0.0.1:5173` as a Redirect URI.
2. Copy `.env.example` to `.env.local` and set `VITE_SPOTIFY_CLIENT_ID`.
   Never put the client secret in this app; PKCE does not need it.
3. `npm install`, then `npm run dev`, and open <http://127.0.0.1:5173> (not `localhost`, Spotify rejects it).

## Deploy on Netlify

`netlify.toml` already holds the build settings.

1. Push this repo to GitHub and import it in Netlify.
2. In **Site configuration → Environment variables**, add `VITE_SPOTIFY_CLIENT_ID`.
3. Deploy, then add the site URL (e.g. `https://your-site.netlify.app`) as a Redirect URI in the Spotify dashboard.

## Limits to know about

- **Spotify Premium** is required to play the clips (a Web Playback SDK rule).
- **Desktop browsers only.** The Web Playback SDK does not run on mobile browsers.
- While the Spotify app is in **development mode**, only accounts added under
  *User Management* in the dashboard can log in.
