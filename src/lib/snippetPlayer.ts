// Plays short clips of a track through the Spotify Web Playback SDK (the player in this tab).
//
// How a round works:
//   1. load:  start the song muted, pause it for sure, rewind to 0:00, unmute.
//   2. clip:  resume → wait N ms → pause for sure → rewind. Local SDK calls, so timing is tight.
//   3. song:  after the round, play / pause / resume the whole song.
//
// The one rule that keeps it safe: the volume only goes back up once the SDK itself reports
// "paused". A pause is re-sent until it sticks, so music can never run on unnoticed.

import { getAccessToken } from './auth'
import { SpotifyError, spotifyFetch } from './spotifyApi'

const SDK_URL = 'https://sdk.scdn.co/spotify-player.js'
const PLAYER_NAME = 'Do You Know Your Playlist'
const VOLUME = 0.6
const CONNECT_TIMEOUT_MS = 15_000
const LOAD_TIMEOUT_MS = 8_000
const PAUSE_ATTEMPTS = 8
const PAUSE_CHECK_MS = 120

const wait = (ms: number) => new Promise<void>((resolve) => window.setTimeout(resolve, ms))

function loadSdk(): Promise<void> {
  if (window.Spotify) return Promise.resolve()

  return new Promise((resolve, reject) => {
    window.onSpotifyWebPlaybackSDKReady = () => resolve()
    const script = document.createElement('script')
    script.src = SDK_URL
    script.async = true
    script.onerror = () => reject(new Error('Could not load the Spotify player. Check your connection or ad blocker.'))
    document.head.appendChild(script)
  })
}

/** True if the SDK state shows this track (also when Spotify swapped in a regional copy). */
function isTrack(state: Spotify.PlaybackState | null, uri: string): boolean {
  const current = state?.track_window.current_track
  if (!current) return false
  const id = uri.split(':').pop()
  return current.uri === uri || current.linked_from?.uri === uri || current.id === id || current.linked_from?.id === id
}

export class SnippetPlayer {
  /** Errors that happen outside a direct call, e.g. the account is not Premium. */
  onError: (message: string) => void = () => {}
  /** Fires whenever this tab's player starts or stops making sound. */
  onPlayingChange: (playing: boolean) => void = () => {}

  private player?: Spotify.Player
  private deviceId = ''
  private loadedUri = ''
  /** Bumped by every command; slower, older commands see the change and give up. */
  private command = 0
  private clipTimer?: number
  private endClip?: () => void
  /** A stop that is still running; new playback waits for it. */
  private stopping: Promise<void> = Promise.resolve()

  // ── Connection ────────────────────────────────────────────────────────────

  async connect(): Promise<void> {
    if (this.deviceId) return

    // A player that lost its connection is replaced rather than reused.
    this.player?.disconnect()
    this.loadedUri = ''
    await loadSdk()

    const player = new window.Spotify!.Player({
      name: PLAYER_NAME,
      volume: VOLUME,
      getOAuthToken: (callback) => {
        getAccessToken()
          .then(callback)
          .catch((error: Error) => this.onError(error.message))
      },
    })
    this.player = player

    const firstReady = new Promise<string>((resolve, reject) => {
      player.addListener('ready', ({ device_id }) => resolve(device_id))
      player.addListener('account_error', () => reject(new Error('Spotify Premium is required to play the clips.')))
      player.addListener('authentication_error', () =>
        reject(new Error('Spotify could not verify your login. Please log out and connect again.')),
      )
      player.addListener('initialization_error', () =>
        reject(new Error('This browser cannot run the Spotify player. Try Chrome, Edge or Firefox on a computer.')),
      )
      window.setTimeout(() => reject(new Error('The Spotify player took too long to start. Please try again.')), CONNECT_TIMEOUT_MS)
    })

    // The SDK reconnects by itself after network hiccups; keep the device id in sync.
    player.addListener('ready', ({ device_id }) => {
      if (this.player === player) this.deviceId = device_id
    })
    player.addListener('not_ready', () => {
      if (this.player !== player) return
      this.deviceId = ''
      this.loadedUri = ''
    })
    player.addListener('player_state_changed', (state) => {
      if (this.player === player) this.onPlayingChange(Boolean(state && !state.paused))
    })
    player.addListener('account_error', () => this.onError('Spotify Premium is required to play the clips.'))
    player.addListener('playback_error', ({ message }) => this.onError(`Playback problem: ${message}`))

    if (!(await player.connect())) throw new Error('Could not connect to Spotify.')
    this.deviceId = await firstReady
    await this.makeThisTabActive()
  }

  disconnect(): void {
    this.command++
    this.clearClip()
    this.player?.disconnect()
    this.player = undefined
    this.deviceId = ''
    this.loadedUri = ''
  }

  /** Moves Spotify playback to this tab (the user may have been listening on their phone). */
  private async makeThisTabActive(): Promise<void> {
    for (let attempt = 1; ; attempt++) {
      try {
        await spotifyFetch('/me/player', {
          method: 'PUT',
          body: JSON.stringify({ device_ids: [this.deviceId], play: false }),
        })
        return
      } catch (error) {
        // A brand-new device can take a moment to be known by the Web API.
        if (!(error instanceof SpotifyError) || error.status !== 404 || attempt >= 4) throw error
        await wait(700)
      }
    }
  }

  // ── Low-level helpers ─────────────────────────────────────────────────────

  /** Resolves with the first SDK state that matches, or null after the timeout. */
  private async waitForState(
    matches: (state: Spotify.PlaybackState | null) => boolean,
    timeoutMs: number,
  ): Promise<Spotify.PlaybackState | null> {
    const player = this.player!
    const now = await player.getCurrentState()
    if (matches(now)) return now

    return new Promise((resolve) => {
      const onChange = (state: Spotify.PlaybackState | null) => {
        if (matches(state)) done(state)
      }
      const timer = window.setTimeout(() => done(null), timeoutMs)
      const done = (state: Spotify.PlaybackState | null) => {
        window.clearTimeout(timer)
        player.removeListener('player_state_changed', onChange as never)
        resolve(state)
      }
      player.addListener('player_state_changed', onChange)
    })
  }

  /** Sends pause until the SDK confirms it. Returns false if it never did. */
  private async pauseForSure(): Promise<boolean> {
    const player = this.player
    if (!player) return true

    for (let attempt = 0; attempt < PAUSE_ATTEMPTS; attempt++) {
      await player.pause().catch(() => {})
      await wait(PAUSE_CHECK_MS)
      const state = await player.getCurrentState()
      if (!state || state.paused) return true
    }
    return false
  }

  /** Last resort: ask the Web API to pause whatever the account is playing. */
  private async pauseAccount(): Promise<void> {
    await spotifyFetch('/me/player/pause', { method: 'PUT' }).catch(() => {
      // 403 means it was already paused.
    })
  }

  private clearClip(): void {
    window.clearTimeout(this.clipTimer)
    this.endClip?.()
    this.clipTimer = undefined
    this.endClip = undefined
  }

  // ── Loading a song ────────────────────────────────────────────────────────

  /** Starts the song muted, then parks it paused at 0:00 so clips can start instantly. */
  private async load(uri: string): Promise<void> {
    // Never send "play" without our device id: Spotify would use another device we can't pause.
    if (!this.deviceId) await this.connect()
    const player = this.player!
    this.loadedUri = ''

    await player.setVolume(0)

    const play = () =>
      spotifyFetch(`/me/player/play?device_id=${this.deviceId}`, {
        method: 'PUT',
        body: JSON.stringify({ uris: [uri], position_ms: 0 }),
      })
    try {
      await play()
    } catch (error) {
      // The device can drop out of the Web API's view; re-attach it and try once more.
      if (!(error instanceof SpotifyError) || error.status !== 404) throw error
      await this.makeThisTabActive()
      await play()
    }

    const started = await this.waitForState((s) => isTrack(s, uri) && !s!.paused, LOAD_TIMEOUT_MS)
    const paused = await this.pauseForSure()
    await player.seek(0)

    if (!paused) {
      await this.pauseAccount()
      throw new Error('Spotify would not pause. Press play to try again.') // volume stays at 0
    }
    await player.setVolume(VOLUME)
    if (!started) throw new Error('Spotify did not start the song. Press play to try again.')

    this.loadedUri = uri
  }

  // ── Public commands ───────────────────────────────────────────────────────

  /** Loads the next round's song without playing anything audible. */
  async prepare(uri: string): Promise<void> {
    this.command++
    this.clearClip()
    await this.stopping
    if (this.loadedUri !== uri) await this.load(uri)
  }

  /**
   * Plays the first `durationMs` of the song, then pauses and rewinds to 0:00.
   * `onStart` fires when the audio starts, so the UI can animate in sync.
   * Resolves when the clip ends or is interrupted by another command.
   */
  async playClip(uri: string, durationMs: number, onStart?: () => void): Promise<void> {
    const command = ++this.command
    this.clearClip()
    await this.stopping
    if (this.loadedUri !== uri) await this.load(uri)
    if (command !== this.command) return

    const player = this.player!
    await player.activateElement()
    await player.seek(0)
    await player.resume()
    if (command !== this.command) return
    onStart?.()

    await new Promise<void>((resolve) => {
      this.endClip = resolve
      this.clipTimer = window.setTimeout(resolve, durationMs)
    })
    if (command !== this.command) return

    await this.pauseForSure()
    await player.seek(0)
  }

  /** Plays the whole song from the start (after a round is over). */
  async playSong(uri: string): Promise<void> {
    this.command++
    this.clearClip()
    await this.stopping
    if (this.loadedUri !== uri) await this.load(uri)
    await this.player!.seek(0)
    await this.player!.resume()
  }

  /** Continues the song from where it was paused. */
  async resume(): Promise<void> {
    this.command++
    await this.player?.resume()
  }

  /** Pauses without rewinding. */
  async pause(): Promise<void> {
    this.command++
    this.clearClip()
    if (!(await this.pauseForSure())) await this.pauseAccount()
  }

  /** Silences everything and rewinds to 0:00. */
  stop(): Promise<void> {
    this.command++
    this.clearClip()
    this.stopping = (async () => {
      if (!this.player || !this.deviceId) return
      if (!(await this.pauseForSure())) await this.pauseAccount()
      await this.player?.seek(0)
    })()
    return this.stopping
  }
}
