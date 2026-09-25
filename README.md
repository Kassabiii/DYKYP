# DYKYP — Do You Know Your Playlist?

A guess-the-song game played on your own Spotify playlist. You hear **0.1 s** of a song.
Name it, or skip (a wrong guess also counts as a skip), and the clip gets longer:
0.1 s → 0.5 s → 1 s → 2 s → 4 s → 8 s. The faster you get it, the more points you score.

Built with Vue 3, TypeScript, Vite and the Spotify Web Playback SDK. Static site, no backend.

## What you need

- A **Spotify Premium** account (Spotify only lets Premium accounts play music in the browser).
- A **desktop browser**: Chrome, Edge or Firefox. Phone browsers can't run the Spotify player.
- **Node.js 20 or newer** to run it on your computer ([nodejs.org](https://nodejs.org)).

## Run it on your computer

1. **Unzip** `DYKYP.zip` and open a terminal inside the `DYKYP` folder.
2. **Create a Spotify app** in the [Spotify Developer Dashboard](https://developer.spotify.com/dashboard):
   - Click *Create app*. Any name and description will do.
   - Redirect URI: `http://127.0.0.1:5173`
   - Tick **Web API** and **Web Playback SDK**, then save.
   - Copy the **Client ID** from the app's settings.
   - Under **User Management**, add the Spotify account(s) that will play.
3. **Add your Client ID.** Copy `.env.example` to a new file named `.env.local`
   and paste the Client ID after `VITE_SPOTIFY_CLIENT_ID=`.
   You never need the Client secret; don't put it in this app.
4. **Install and start:**
   ```
   npm install
   npm run dev
   ```
5. Open **<http://127.0.0.1:5173>**. Use this exact address: Spotify rejects `localhost`.

## How to play

1. **Connect Spotify** and allow access.
2. **Pick how many songs** (5, 10 or 20) and **choose one of your playlists**.
3. Press **▶** (or **Space**) to hear the first **0.1 s** of a random song from it.
4. **Type** a title or artist and pick the song from the list (**↑ ↓** then **Enter**).
   - Right: you score points. The shorter the clip, the more: 100, 80, 60, 40, 20, 10.
   - Wrong, or **Skip**: the next, longer clip plays straight away.
   - After the 8 s clip, the answer is revealed.
5. After each round you can **play, pause and resume the full song**, then go to the next one.
6. At the end you see your score and every answer. **Play again** or pick another playlist.

Songs never repeat within a game, and only songs from the chosen playlist are suggested.

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

emium account. |
| Login works but nothing plays | Check the account is listed under *User Management*, and use a desktop browser. |
| "Port 5173 is already in use" | Another copy is running. Close it, or stop it with Ctrl+C in its terminal. |
| No sound | Check the tab isn't muted, and that Spotify isn't set to play on another device. |
