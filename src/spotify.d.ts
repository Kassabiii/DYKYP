interface Window { onSpotifyWebPlaybackSDKReady?: () => void; Spotify: { Player: new (options: { name: string; getOAuthToken: (callback: (token: string) => void) => void; volume?: number }) => Spotify.Player } }
declare namespace Spotify { interface Player { connect(): boolean; pause(): Promise<void>; addListener(event: string, callback: (data: any) => void): boolean } }
