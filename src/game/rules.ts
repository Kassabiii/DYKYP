// Game rules, kept free of Vue and Spotify so they are easy to read and change.

import type { Track } from '../lib/spotifyApi'

/** Clip length for each attempt. A wrong guess or a skip unlocks the next one. */
export const TIERS_MS = [100, 500, 1000, 2000, 4000, 8000] as const

/** Points for a correct guess at each tier (same order as TIERS_MS). */
export const POINTS = [100, 80, 60, 40, 20, 10] as const

export const LAST_TIER = TIERS_MS.length - 1

export const ROUND_OPTIONS = [5, 10, 20] as const

/** The smallest playlist that makes a fair game. */
export const MIN_TRACKS = 5

/** 100 → "0.1s", 1000 → "1s", 2500 → "2.5s" */
export function formatSeconds(ms: number): string {
  return `${ms / 1000}s`
}

/**
 * Reduces a title to its core so that "Song (Remastered 2011)" and "Song - Live"
 * count as the same song as "Song".
 */
export function normalizeTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/\s+-\s+.*$/, '') // " - Remastered", " - Live at ..."
    .replace(/[([].*?[)\]]/g, '') // "(feat. X)", "[Radio Edit]"
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // accents
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

/**
 * A guess is right if it is the exact track, or the same song by the same artist
 * (a playlist can hold both the album and the single version).
 */
export function isCorrectGuess(guess: Track, answer: Track): boolean {
  if (guess.id === answer.id) return true
  const sameTitle = normalizeTitle(guess.name) === normalizeTitle(answer.name)
  const sharedArtist = guess.artists.some((artist) => answer.artists.includes(artist))
  return sameTitle && sharedArtist
}

/** Fisher–Yates shuffle; returns a new array. */
export function shuffle<T>(items: readonly T[]): T[] {
  const copy = [...items]
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[copy[i], copy[j]] = [copy[j], copy[i]]
  }
  return copy
}
