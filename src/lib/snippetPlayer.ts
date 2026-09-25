// Plays short clips of a track through the Spotify Web Playback SDK.
//
// Why it works this way: starting a song through the Web API takes a few hundred
// milliseconds and the delay varies, which would ruin a 0.1 second clip. So each
// round "loads" the song once (muted, via the Web API) and leaves it paused at 0:00.
// Every clip after that uses the SDK's local resume/pause, which is much faster and
// more consistent.

import { getAccessToken } from './auth'
import { SpotifyError, spotifyFetch } from './spotifyApi'

const SDK_URL = 'https://sdk.scdn.co/spotify-player.js'
const PLAYER_NAME = 'Do You Know Your Playlist'
const VOLUME = 0.6
const CONNECT_TIMEOUT_MS = 15_000
const LOAD_TIMEOUT_MS = 8_000

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

function isTrack(state: Spotify.PlaybackState | null, uri: string): boolean {
  const current = state?.track_window.current_track
  return Boolean(current && (current.uri === uri || current.linked_from?.uri === uri))
}

export class SnippetPlayer {
  /** Called for errors that happen outside a direct call, e.g. the account is not Premium. */
  onError: (message: string) => void = () => {}

  private player?: Spotify.Player
  private deviceId = ''
  private loadedUri = ''
  private stopTimer?: number
  /** Resolves the clip that is currently playing, so interrupted clips never hang. */
  private endClip?: () => void
  /** Increases with every play/stop so that older, slower calls know they are outdated. */
  private playId = 0

  get connected(): boolean {
    return Boolean(this.deviceId)
  }

  async connect(): Promise<void> {
    if (this.deviceId) return
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

    const ready = new Promise<string>((resolve, reject) => {
      player.addListener('ready', ({ device_id }) => resolve(device_id))
      player.addListener('account_error', () =>
        reject(new Error('Spotify Premium is required to play the clips.')),
      )
      player.addListener('authentication_error', () =>
        reject(new Error('Spotify could not verify your login. Please log out and connect again.')),
      )
      player.addListener('initialization_error', () =>
        reject(new Error('This browser cannot run the Spotify player. Try Chrome, Edge or Firefox on a computer.')),
      )
      window.setTimeout(() => reject(new Error('The Spotify player took too long to start. Please try again.')), CONNECT_TIMEOUT_MS)
    })

    // After start-up, surface problems to the UI instead of failing silently.
    player.addListener('account_error', () => this.onError('Spotify Premium is required to play the clips.'))
    player.addListener('playback_error', ({ message }) => this.onError(`Playback problem: ${message}`))
    player.addListener('not_ready', () => {
      this.deviceId = ''
      this.loadedUri = ''
    })

    const connected = await player.connect()
    if (!connected) throw new Error('Could not connect to Spotify.')

    this.deviceId = await ready
    await this.transferPlayback()
  }

  /** Makes this browser tab the active Spotify device (the user may be playing on their phone). */
  private async transferPlayback(): Promise<void> {
    for (let attempt = 0; ; attempt++) {
      try {
        await spotifyFetch('/me/player', {
          method: 'PUT',
          body: JSON.stringify({ device_ids: [this.deviceId], play: false }),
        })
        return
      } catch (error) {
        // A freshly created device can take a moment to be known by the Web API.
        if (!(error instanceof SpotifyError) || error.status !== 404 || attempt >= 3) throw error
        await wait(700)
      }
    }
  }

  /** Resolves with the first state that matches, or null after the timeout. */
  private async waitForState(
    matches: (state: Spotify.PlaybackState | null) => boolean,
    timeoutMs: number,
  ): Promise<Spotify.PlaybackState | null> {
    const player = this.player!
    const current = await player.getCurrentState()
    if (matches(current)) return current

    return new Promise((resolve) => {
      const onChange = (state: Spotify.PlaybackState | null) => {
        if (!matches(state)) return
        cleanup()
        resolve(state)
      }
      const timer = window.setTimeout(() => {
        cleanup()
        resolve(null)
      }, timeoutMs)
      const cleanup = () => {
        window.clearTimeout(timer)
        player.removeListener('player_state_changed', onChange as never)
      }
      player.addListener('player_state_changed', onChange)
    })
  }

  /** Starts the track muted, then parks it paused at 0:00 so clips can start instantly. */
  private async load(uri: string): Promise<void> {
    const player = this.player!
    this.loadedUri = ''
    await player.setVolume(0)

    try {
      const body = JSON.stringify({ uris: [uri], position_ms: 0 })
      try {
        await spotifyFetch(`/me/player/play?device_id=${this.deviceId}`, { method: 'PUT', body })
      } catch (error) {
        // The device can drop out of the Web API's view; re-attach it and try once more.
        if (!(error instanceof SpotifyError) || error.status !== 404) throw error
        await this.transferPlayback()
        await spotifyFetch(`/me/player/play?device_id=${this.deviceId}`, { method: 'PUT', body })
      }

      const started = await this.waitForState((s) => isTrack(s, uri) && !s!.paused, LOAD_TIMEOUT_MS)
      await player.pause()
      await player.seek(0)
      if (!started) throw new Error('Spotify did not start the song. Press play to try again.')

      this.loadedUri = uri
    } finally {
      await this.waitForState((s) => !s || s.paused, 1_000)
      await player.setVolume(VOLUME)
    }
  }

  /** Prepares a track for the next round without playing anything audible. */
  async prepare(uri: string): Promise<void> {
    this.playId++
    this.clearTimer()
    if (this.loadedUri !== uri) await this.load(uri)
  }

  /**
   * Plays the first `durationMs` of the track, then pauses and rewinds to 0:00.
   * `onStart` fires the moment audio is requested, so the UI can animate in sync.
   * Resolves when the clip has finished (or was interrupted by another call).
   */
  async playClip(uri: string, durationMs: number, onStart?: () => void): Promise<void> {
    const id = ++this.playId
    this.clearTimer()
    const player = this.player!

    if (this.loadedUri !== uri) await this.load(uri)
    if (id !== this.playId) return

    await player.activateElement()
    await player.seek(0)
    await player.resume()
    if (id !== this.playId) return
    onStart?.()

    await new Promise<void>((resolve) => {
      this.endClip = resolve
      this.stopTimer = window.setTimeout(resolve, durationMs)
    })
    if (id !== this.playId) return
    await this.pauseAndRewind()
  }

  /** Plays the whole song from the start (after a round is over). */
  async playFull(uri: string): Promise<void> {
    this.playId++
    this.clearTimer()
    if (this.loadedUri !== uri) await this.load(uri)
    await this.player!.seek(0)
    await this.player!.resume()
  }

  async stop(): Promise<void> {
    this.playId++
    this.clearTimer()
    if (this.player && this.deviceId) await this.pauseAndRewind()
  }

  disconnect(): void {
    this.playId++
    this.clearTimer()
    this.player?.disconnect()
    this.player = undefined
    this.deviceId = ''
    this.loadedUri = ''
  }

  private clearTimer(): void {
    window.clearTimeout(this.stopTimer)
    this.stopTimer = undefined
    this.endClip?.()
    this.endClip = undefined
  }

  private async pauseAndRewind(): Promise<void> {
    await this.player!.pause()
    await this.player!.seek(0)
  }
}
