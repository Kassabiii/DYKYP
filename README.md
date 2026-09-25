# Do You Know Your Playlist?

A Spotify Premium guessing game built with Vue 3, Vite, and the Spotify Web Playback SDK.

## Setup

1. Create an app in the [Spotify Developer Dashboard](https://developer.spotify.com/dashboard) and add `http://127.0.0.1:5173` as a Redirect URI.
2. Copy `.env.example` to `.env.local` and set `VITE_SPOTIFY_CLIENT_ID`. Never put a Spotify client secret in this frontend app.
3. Run `npm run dev`, open the local URL, and connect a Spotify Premium account.

The app uses PKCE authentication and keeps the access token only for the browser session. Spotify Premium is required by the Web Playback SDK.
