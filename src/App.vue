<script setup lang="ts">
// Screen flow: welcome → playlists → game → results.
// Login, API calls, playback and game rules live in src/lib and src/game.

import { onBeforeUnmount, onMounted, reactive, ref } from 'vue'
import * as auth from './lib/auth'
import { SnippetPlayer } from './lib/snippetPlayer'
import { getPlaylistTracks, getPlaylists, getProfile } from './lib/spotifyApi'
import type { Playlist, Profile, Track } from './lib/spotifyApi'
import { MIN_TRACKS, ROUND_OPTIONS } from './game/rules'
import { useGame } from './game/useGame'
import GameView from './views/GameView.vue'
import PlaylistView from './views/PlaylistView.vue'
import ResultsView from './views/ResultsView.vue'
import WelcomeView from './views/WelcomeView.vue'

type View = 'welcome' | 'playlists' | 'game' | 'results'

const player = new SnippetPlayer()
const game = reactive(useGame(player))

const view = ref<View>(auth.hasSession() ? 'playlists' : 'welcome')
const error = ref('')
const busy = ref(false)
const profile = ref<Profile | null>(null)
const playlists = ref<Playlist[]>([])
const loadingPlaylists = ref(false)
const openingId = ref<string | null>(null)
const selected = ref<Playlist | null>(null)
const rounds = ref<number>(ROUND_OPTIONS[0])

let selectedTracks: Track[] = []

player.onError = (message) => {
  error.value = message
}

function show(e: unknown, fallback: string): void {
  error.value = e instanceof Error ? e.message : fallback
}

async function connect(): Promise<void> {
  error.value = ''
  busy.value = true
  try {
    await auth.startLogin()
  } catch (e) {
    show(e, 'Could not open Spotify login.')
    busy.value = false
  }
}

async function loadLibrary(): Promise<void> {
  loadingPlaylists.value = true
  try {
    const [me, lists] = await Promise.all([getProfile(), getPlaylists()])
    profile.value = me
    playlists.value = lists
  } catch (e) {
    show(e, 'Could not load your playlists.')
  } finally {
    loadingPlaylists.value = false
  }
}

async function choose(playlist: Playlist): Promise<void> {
  error.value = ''
  openingId.value = playlist.id
  try {
    const tracks = await getPlaylistTracks(playlist.id)
    if (tracks.length < MIN_TRACKS) {
      throw new Error(`“${playlist.name}” has ${tracks.length} playable songs. Pick one with at least ${MIN_TRACKS}.`)
    }
    // Connecting the player needs Premium; this is where a free account is stopped.
    await player.connect()

    selected.value = playlist
    selectedTracks = tracks
    game.start(tracks, rounds.value)
    view.value = 'game'
  } catch (e) {
    show(e, 'Could not open this playlist.')
  } finally {
    openingId.value = null
  }
}

async function showResults(): Promise<void> {
  await game.stop()
  view.value = 'results'
}

function playAgain(): void {
  game.start(selectedTracks, rounds.value)
  view.value = 'game'
}

async function backToPlaylists(): Promise<void> {
  await game.stop()
  error.value = ''
  view.value = 'playlists'
}

async function logout(): Promise<void> {
  // Pause first, while the login is still valid.
  await game.stop()
  player.disconnect()
  auth.logout()
  profile.value = null
  playlists.value = []
  view.value = 'welcome'
}

onMounted(async () => {
  try {
    if (await auth.completeLoginFromUrl()) view.value = 'playlists'
  } catch (e) {
    show(e, 'Login failed.')
    view.value = 'welcome'
    return
  }
  if (view.value === 'playlists') await loadLibrary()
})

onBeforeUnmount(() => player.disconnect())
</script>

<template>
  <div class="shell">
    <header class="topbar">
      <button
        v-if="view === 'game' || view === 'results'"
        type="button"
        class="brand"
        aria-label="Back to playlists"
        @click="backToPlaylists"
      >
        ← Playlists
      </button>
      <span v-else-if="view !== 'welcome'" class="brand">Do you know your playlist?</span>
      <span v-else />

      <div v-if="view !== 'welcome'" class="account">
        <span v-if="profile" class="muted">{{ profile.name }}</span>
        <button type="button" class="link" @click="logout">Log out</button>
      </div>
    </header>

    <Transition name="fade">
      <p v-if="error" class="notice" role="alert">
        {{ error }}
        <button type="button" class="link" aria-label="Dismiss" @click="error = ''">✕</button>
      </p>
    </Transition>

    <p v-if="profile?.product && profile.product !== 'premium' && view === 'playlists'" class="notice">
      This account is on Spotify {{ profile.product }}. You can browse playlists, but the clips need Premium.
    </p>

    <main>
      <Transition name="view" mode="out-in">
        <WelcomeView v-if="view === 'welcome'" :busy="busy" @connect="connect" />

        <PlaylistView
          v-else-if="view === 'playlists'"
          v-model:rounds="rounds"
          :playlists="playlists"
          :loading="loadingPlaylists"
          :opening-id="openingId"
          @choose="choose"
        />

        <GameView
          v-else-if="view === 'game'"
          :game="game"
          :playlist-name="selected?.name ?? ''"
          @finish="showResults"
        />

        <ResultsView
          v-else
          :score="game.score"
          :history="game.history"
          :playlist-name="selected?.name ?? ''"
          @again="playAgain"
          @change="backToPlaylists"
        />
      </Transition>
    </main>
  </div>
</template>

<style scoped>
.shell {
  display: grid;
  grid-template-rows: auto auto auto 1fr;
  width: min(960px, 100%);
  min-height: 100vh;
  margin: 0 auto;
  padding: 24px 24px 64px;
}

.topbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding-bottom: 40px;
}

.brand {
  padding: 0;
  border: 0;
  background: none;
  color: var(--fg);
  font: 500 13px/1 var(--mono);
  text-transform: uppercase;
  letter-spacing: 0.06em;
}

button.brand {
  cursor: pointer;
  color: var(--muted);
  transition: color var(--ease);
}

button.brand:hover {
  color: var(--fg);
}

.account {
  display: flex;
  align-items: center;
  gap: 16px;
  font-size: 14px;
}

.notice {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  margin: 0 0 24px;
}

@media (max-width: 520px) {
  .shell {
    padding: 16px 16px 48px;
  }

  .topbar {
    padding-bottom: 28px;
  }

  .account .muted {
    display: none;
  }
}
</style>
