<script setup lang="ts">
// Autocomplete scoped to the playlist's own songs (no Spotify search), keyboard friendly.
import Fuse from 'fuse.js'
import { computed, ref, watch } from 'vue'
import type { Track } from '../lib/spotifyApi'

const props = defineProps<{
  tracks: Track[]
  /** Songs already guessed wrong this round; shown but not selectable. */
  wrongIds: string[]
  skipLabel: string
  disabled?: boolean
}>()

const emit = defineEmits<{
  guess: [track: Track]
  skip: []
  play: []
}>()

const MAX_SUGGESTIONS = 6

const query = ref('')
const activeIndex = ref(0)
const input = ref<HTMLInputElement>()

const fuse = computed(
  () => new Fuse(props.tracks, { keys: [{ name: 'name', weight: 2 }, 'artists'], threshold: 0.35, ignoreLocation: true }),
)

const suggestions = computed(() =>
  query.value.trim() ? fuse.value.search(query.value.trim(), { limit: MAX_SUGGESTIONS }).map((r) => r.item) : [],
)

const selectable = computed(() => suggestions.value.filter((t) => !props.wrongIds.includes(t.id)))
const activeTrack = computed(() => selectable.value[activeIndex.value] ?? null)
const open = computed(() => suggestions.value.length > 0)

watch(query, () => (activeIndex.value = 0))

function move(step: number): void {
  if (!selectable.value.length) return
  activeIndex.value = (activeIndex.value + step + selectable.value.length) % selectable.value.length
}

function choose(track: Track | null): void {
  if (!track || props.disabled || props.wrongIds.includes(track.id)) return
  emit('guess', track)
  query.value = ''
}

// A title never starts with a space, so Space in an empty box means "play the clip".
function onSpace(event: KeyboardEvent): void {
  if (query.value) return
  event.preventDefault()
  emit('play')
}

function skip(): void {
  query.value = ''
  emit('skip')
}

defineExpose({ focus: () => input.value?.focus() })
</script>

<template>
  <div class="guess">
    <div class="field" :class="{ open }">
      <input
        ref="input"
        v-model="query"
        type="text"
        role="combobox"
        aria-label="Your guess"
        aria-autocomplete="list"
        aria-controls="suggestions"
        :aria-expanded="open"
        :aria-activedescendant="activeTrack ? `option-${activeTrack.id}` : undefined"
        autocomplete="off"
        spellcheck="false"
        placeholder="Type a song or artist…"
        :disabled="disabled"
        @keydown.down.prevent="move(1)"
        @keydown.up.prevent="move(-1)"
        @keydown.enter.prevent="choose(activeTrack)"
        @keydown.esc="query = ''"
        @keydown.space="onSpace"
      />

      <Transition name="drop">
        <ul v-if="open" id="suggestions" class="suggestions" role="listbox" aria-label="Songs in this playlist">
          <li
            v-for="track in suggestions"
            :id="`option-${track.id}`"
            :key="track.id"
            role="option"
            :aria-selected="track.id === activeTrack?.id"
            :aria-disabled="wrongIds.includes(track.id)"
            :class="{ active: track.id === activeTrack?.id, wrong: wrongIds.includes(track.id) }"
            @mousedown.prevent="choose(track)"
            @mousemove="activeIndex = Math.max(0, selectable.indexOf(track))"
          >
            <span class="name">{{ track.name }}</span>
            <span class="artist">{{ track.artists.join(', ') }}</span>
          </li>
        </ul>
      </Transition>
    </div>

    <div class="actions">
      <button type="button" class="button ghost" :disabled="disabled" @click="skip">{{ skipLabel }}</button>
      <button type="button" class="button primary" :disabled="disabled || !activeTrack" @click="choose(activeTrack)">
        Guess
      </button>
    </div>
  </div>
</template>

<style scoped>
.guess {
  display: grid;
  gap: 14px;
}

.field {
  position: relative;
}

input {
  width: 100%;
  padding: 16px 18px;
  border: 1px solid var(--line-strong);
  border-radius: 14px;
  background: var(--bg);
  color: var(--fg);
  font-size: 17px;
  transition:
    border-color var(--ease),
    border-radius var(--ease);
}

input::placeholder {
  color: var(--faint);
}

input:focus {
  outline: none;
  border-color: var(--fg);
}

.open input {
  border-bottom-left-radius: 0;
  border-bottom-right-radius: 0;
}

.suggestions {
  position: absolute;
  z-index: 5;
  top: 100%;
  right: 0;
  left: 0;
  margin: 0;
  padding: 6px;
  list-style: none;
  border: 1px solid var(--fg);
  border-top: 0;
  border-radius: 0 0 14px 14px;
  background: var(--bg);
  box-shadow: 0 24px 48px rgb(0 0 0 / 0.8);
}

li {
  display: grid;
  gap: 2px;
  padding: 10px 12px;
  border-radius: 8px;
  cursor: pointer;
  transition:
    background-color var(--ease),
    color var(--ease);
}

li.active {
  background: var(--fg);
  color: var(--bg);
}

li.active .artist {
  color: #555;
}

li.wrong {
  cursor: not-allowed;
  opacity: 0.4;
  text-decoration: line-through;
}

.name {
  font-weight: 500;
}

.artist {
  color: var(--muted);
  font-size: 13px;
}

.actions {
  display: flex;
  justify-content: space-between;
  gap: 12px;
}

.drop-enter-active,
.drop-leave-active {
  transition:
    opacity var(--ease),
    transform var(--ease);
}

.drop-enter-from,
.drop-leave-to {
  opacity: 0;
  transform: translateY(-4px);
}
</style>
