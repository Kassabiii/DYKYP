// The game's state machine. One round goes:
//
//   loading → ready ⇄ playing → revealed
//
// "ready" means the song is parked at 0:00 and the player can listen or guess.
// A wrong guess or a skip unlocks a longer clip and plays it straight away.
// A right guess, or running out of clips, reveals the answer.

import { computed, ref } from 'vue'
import type { Track } from '../lib/spotifyApi'
import type { SnippetPlayer } from '../lib/snippetPlayer'
import { LAST_TIER, POINTS, TIERS_MS, isCorrectGuess, shuffle } from './rules'

export type Phase = 'loading' | 'ready' | 'playing' | 'revealed'

export type Attempt = { kind: 'wrong'; track: Track } | { kind: 'skip' }

export interface RoundResult {
  track: Track
  correct: boolean
  /** Tier index of the correct guess, or null when the answer was revealed. */
  tier: number | null
  points: number
}

export function useGame(player: SnippetPlayer) {
  const tracks = ref<Track[]>([])
  const totalRounds = ref(0)
  const round = ref(0)
  const current = ref<Track | null>(null)
  const tier = ref(0)
  const attempts = ref<Attempt[]>([])
  const phase = ref<Phase>('loading')
  const score = ref(0)
  const history = ref<RoundResult[]>([])
  const error = ref('')
  /** Set while a clip is audible, so the UI can animate its progress. */
  const clip = ref<{ id: number; durationMs: number } | null>(null)
  /** After a round: whether the full song is playing, and whether it was started at all. */
  const songPlaying = ref(false)
  const songStarted = ref(false)

  // The player reports real play/pause changes, so the button is right even if the
  // user pauses from the Spotify app or a media key.
  player.onPlayingChange = (playing) => {
    if (phase.value === 'revealed' && songStarted.value) songPlaying.value = playing
  }

  let deck: Track[] = []
  let clipCounter = 0

  const clipMs = computed(() => TIERS_MS[tier.value])
  const lastResult = computed(() => history.value.at(-1) ?? null)
  const isLastRound = computed(() => round.value >= totalRounds.value)

  function start(playlistTracks: Track[], rounds: number): void {
    tracks.value = playlistTracks
    // Drawing from a shuffled deck means no song repeats within a game.
    deck = shuffle(playlistTracks)
    totalRounds.value = Math.min(rounds, playlistTracks.length)
    round.value = 0
    score.value = 0
    history.value = []
    void nextRound()
  }

  async function nextRound(): Promise<void> {
    if (isLastRound.value && round.value > 0) return
    await player.stop()

    round.value++
    current.value = deck.pop() ?? null
    tier.value = 0
    attempts.value = []
    error.value = ''
    phase.value = 'loading'
    songPlaying.value = false
    songStarted.value = false

    try {
      await player.prepare(current.value!.uri)
    } catch (e) {
      // Not fatal: pressing play loads the song again.
      error.value = e instanceof Error ? e.message : 'Could not load the song.'
    }
    if (phase.value === 'loading') phase.value = 'ready'
  }

  async function play(): Promise<void> {
    if (!current.value || phase.value === 'loading' || phase.value === 'revealed') return

    const id = ++clipCounter
    error.value = ''
    phase.value = 'playing'
    clip.value = null

    try {
      await player.playClip(current.value.uri, clipMs.value, () => {
        if (id === clipCounter) clip.value = { id, durationMs: clipMs.value }
      })
    } catch (e) {
      error.value = e instanceof Error ? e.message : 'Playback failed.'
    }

    // Only the most recent clip may end the "playing" state.
    if (id === clipCounter) {
      clip.value = null
      if (phase.value === 'playing') phase.value = 'ready'
    }
  }

  function guess(track: Track): void {
    if (!current.value || phase.value === 'loading' || phase.value === 'revealed') return

    if (isCorrectGuess(track, current.value)) {
      reveal(true)
    } else {
      attempts.value.push({ kind: 'wrong', track })
      unlockNextClip()
    }
  }

  function skip(): void {
    if (phase.value === 'loading' || phase.value === 'revealed') return
    attempts.value.push({ kind: 'skip' })
    unlockNextClip()
  }

  function unlockNextClip(): void {
    if (tier.value >= LAST_TIER) {
      reveal(false)
      return
    }
    tier.value++
    void play()
  }

  function reveal(correct: boolean): void {
    clipCounter++
    clip.value = null
    void player.stop()

    const points = correct ? POINTS[tier.value] : 0
    score.value += points
    history.value.push({
      track: current.value!,
      correct,
      tier: correct ? tier.value : null,
      points,
    })
    phase.value = 'revealed'
  }

  /** Play / pause / resume the whole song once the round is over. */
  async function toggleSong(): Promise<void> {
    if (!current.value || phase.value !== 'revealed') return
    error.value = ''
    try {
      if (songPlaying.value) {
        songPlaying.value = false
        await player.pause()
      } else if (songStarted.value) {
        songPlaying.value = true
        await player.resume()
      } else {
        songStarted.value = true
        songPlaying.value = true
        await player.playSong(current.value.uri)
      }
    } catch (e) {
      songPlaying.value = false
      error.value = e instanceof Error ? e.message : 'Could not play the song.'
    }
  }

  async function stop(): Promise<void> {
    clipCounter++
    clip.value = null
    songPlaying.value = false
    await player.stop()
  }

  return {
    tracks,
    totalRounds,
    round,
    current,
    tier,
    attempts,
    phase,
    score,
    history,
    error,
    clip,
    songPlaying,
    songStarted,
    clipMs,
    lastResult,
    isLastRound,
    start,
    nextRound,
    play,
    guess,
    skip,
    toggleSong,
    stop,
  }
}

export type Game = ReturnType<typeof useGame>
