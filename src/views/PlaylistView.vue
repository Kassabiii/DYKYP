<script setup lang="ts">
import { computed, ref } from 'vue'
import type { Playlist } from '../lib/spotifyApi'
import { ROUND_OPTIONS } from '../game/rules'

const props = defineProps<{
  playlists: Playlist[]
  loading: boolean
  /** Id of the playlist being opened, to show progress on that row. */
  openingId: string | null
}>()

const rounds = defineModel<number>('rounds', { required: true })
const emit = defineEmits<{ choose: [playlist: Playlist] }>()

const filter = ref('')

const visible = computed(() => {
  const term = filter.value.trim().toLowerCase()
  return term ? props.playlists.filter((p) => p.name.toLowerCase().includes(term)) : props.playlists
})
</script>

<template>
  <section class="picker">
    <header class="picker-head">
      <h1>Pick a playlist</h1>
      <p class="muted">Every song comes from the playlist you choose — nothing else.</p>
    </header>

    <div class="controls">
      <fieldset class="rounds">
        <legend class="visually-hidden">Number of rounds</legend>
        <label v-for="option in ROUND_OPTIONS" :key="option">
          <input v-model="rounds" type="radio" name="rounds" :value="option" />
          <span>{{ option }} songs</span>
        </label>
      </fieldset>

      <input
        v-if="playlists.length > 8"
        v-model="filter"
        class="filter"
        type="search"
        placeholder="Filter playlists"
        aria-label="Filter playlists"
      />
    </div>

    <ul v-if="loading" class="list" aria-busy="true" aria-label="Loading playlists">
      <li v-for="n in 6" :key="n" class="skeleton" />
    </ul>

    <p v-else-if="!playlists.length" class="muted">No playlists found on this Spotify account.</p>

    <TransitionGroup v-else name="list" tag="ul" class="list">
      <li v-for="(playlist, index) in visible" :key="playlist.id" :style="{ '--i': Math.min(index, 12) }">
        <button
          type="button"
          class="row"
          :disabled="openingId !== null"
          :aria-busy="openingId === playlist.id"
          @click="emit('choose', playlist)"
        >
          <img v-if="playlist.image" :src="playlist.image" alt="" width="56" height="56" loading="lazy" />
          <span v-else class="cover" aria-hidden="true" />
          <span class="text">
            <span class="name">{{ playlist.name }}</span>
            <span class="meta">{{ playlist.total }} songs · {{ playlist.owner }}</span>
          </span>
          <span class="go" aria-hidden="true">{{ openingId === playlist.id ? '…' : '→' }}</span>
        </button>
      </li>
    </TransitionGroup>
  </section>
</template>

<style scoped>
.picker {
  display: grid;
  gap: 28px;
}

.picker-head {
  display: grid;
  gap: 10px;
}

h1 {
  margin: 0;
  font-size: clamp(36px, 7vw, 56px);
  line-height: 1;
  letter-spacing: -0.04em;
}

.picker-head p {
  margin: 0;
}

.controls {
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  gap: 12px;
}

.rounds {
  display: inline-flex;
  margin: 0;
  padding: 4px;
  border: 1px solid var(--line-strong);
  border-radius: 999px;
}

.rounds input {
  position: absolute;
  opacity: 0;
}

.rounds span {
  display: block;
  padding: 8px 16px;
  border-radius: 999px;
  color: var(--muted);
  font-size: 14px;
  cursor: pointer;
  transition:
    background-color var(--ease),
    color var(--ease);
}

.rounds input:checked + span {
  background: var(--fg);
  color: var(--bg);
}

.rounds input:focus-visible + span {
  outline: 2px solid var(--fg);
  outline-offset: 2px;
}

.filter {
  flex: 1;
  min-width: 180px;
  max-width: 280px;
  padding: 10px 16px;
  border: 1px solid var(--line-strong);
  border-radius: 999px;
  background: var(--bg);
  color: var(--fg);
}

.filter:focus {
  outline: none;
  border-color: var(--fg);
}

.list {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 8px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.row {
  display: flex;
  align-items: center;
  gap: 14px;
  width: 100%;
  padding: 10px;
  border: 1px solid var(--line);
  border-radius: 14px;
  background: var(--bg);
  color: var(--fg);
  text-align: left;
  transition:
    border-color var(--ease),
    background-color var(--ease);
}

.row:hover:not(:disabled) {
  border-color: var(--fg);
}

.row:disabled:not([aria-busy='true']) {
  opacity: 0.4;
}

.row img,
.cover {
  width: 56px;
  height: 56px;
  flex: none;
  border-radius: 8px;
  object-fit: cover;
  background: var(--line);
  filter: grayscale(1);
  transition: filter var(--ease-slow);
}

.row:hover img {
  filter: grayscale(0);
}

.text {
  display: grid;
  gap: 3px;
  min-width: 0;
}

.name {
  overflow: hidden;
  font-weight: 500;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.meta {
  color: var(--muted);
  font-size: 13px;
}

.go {
  margin-left: auto;
  padding-right: 6px;
  color: var(--muted);
  transition:
    transform var(--ease),
    color var(--ease);
}

.row:hover .go {
  color: var(--fg);
  transform: translateX(3px);
}

.skeleton {
  height: 78px;
  border-radius: 14px;
  background: linear-gradient(90deg, var(--line) 0%, #1c1c1c 50%, var(--line) 100%);
  background-size: 200% 100%;
  animation: shimmer 1.2s linear infinite;
}

/* Rows cascade in once, a few ms apart. */
.list-enter-active {
  transition:
    opacity 0.4s ease,
    transform 0.4s cubic-bezier(0.2, 0.7, 0.2, 1);
  transition-delay: calc(var(--i) * 30ms);
}

.list-enter-from {
  opacity: 0;
  transform: translateY(8px);
}

@keyframes shimmer {
  to {
    background-position: -200% 0;
  }
}
</style>
