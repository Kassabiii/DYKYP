// Minimal types for the parts of the Spotify Web Playback SDK this app uses.
// Full reference: https://developer.spotify.com/documentation/web-playback-sdk/reference

declare namespace Spotify {
  interface PlayerOptions {
    name: string
    getOAuthToken: (callback: (token: string) => void) => void
    volume?: number
  }

  interface SdkTrack {
    uri: string
    id: string | null
    linked_from?: { uri: string | null; id: string | null }
  }

  interface PlaybackState {
    paused: boolean
    position: number
    duration: number
    track_window: { current_track: SdkTrack | null }
  }

  interface SdkError {
    message: string
  }

  interface Player {
    connect(): Promise<boolean>
    disconnect(): void
    activateElement(): Promise<void>
    getCurrentState(): Promise<PlaybackState | null>
    pause(): Promise<void>
    resume(): Promise<void>
    seek(positionMs: number): Promise<void>
    setVolume(volume: number): Promise<void>
    addListener(event: 'ready' | 'not_ready', callback: (data: { device_id: string }) => void): boolean
    addListener(event: 'player_state_changed', callback: (state: PlaybackState | null) => void): boolean
    addListener(
      event: 'initialization_error' | 'authentication_error' | 'account_error' | 'playback_error' | 'autoplay_failed',
      callback: (error: SdkError) => void,
    ): boolean
    removeListener(event: string, callback?: (...args: never[]) => void): boolean
  }
}

interface Window {
  onSpotifyWebPlaybackSDKReady?: () => void
  Spotify?: { Player: new (options: Spotify.PlayerOptions) => Spotify.Player }
}
