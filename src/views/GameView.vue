<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import type { UnwrapNestedRefs } from 'vue'
import GuessInput from '../components/GuessInput.vue'
import TierTimeline from '../components/TierTimeline.vue'
import type { Game } from '../game/useGame'
import { LAST_TIER, POINTS, TIERS_MS, formatSeconds } from '../game/rules'

const props = defineProps<{
  game: UnwrapNestedRefs<Game>
  playlistName: string
}>()

const emit = defineEmits<{ finish: [] }>()

const guessInput = ref<InstanceType<typeof GuessInput>>()

const game = computed(() => props.game)
const revealed = computed(() => game.value.phase === 'revealed')
const wrongIds = computed(() =>
  game.value.attempts.flatMap((a) => (a.kind === 'wrong' ? [a.track.id] : [])),
)
const skipLabel = computed(() =>
  game.value.tier >= LAST_TIER ? 'Give up' : `Skip → ${formatSeconds(TIERS_MS[game.value.tier + 1])}`,
)
const playLabel = computed(() => {
  if (game.value.phase === 'loading') return 'Loading song'
  return `Play ${formatSeconds(game.value.clipMs)}`
})

// Space bar plays the clip, unless the player is typing.
function onKeydown(event: KeyboardEvent): void {
  const target = event.target as HTMLElement
  if (event.code !== 'Space' || target.closest('input, button, a, textarea')) return
  event.preventDefault()
  void game.value.play()
}

onMounted(() => window.addEventListener('keydown', onKeydown))
onBeforeUnmount(() => window.removeEventListener('keydown', onKeydown))

// Keep the cursor in the guess box between attempts.
watch(
  () => [game.value.round, game.value.tier, game.value.phase === 'loading'],
  () => nextTick(() => guessInput.value?.focus()),
  { immediate: true },
)
</script>

<template>
  <section class="game">
    <div class="status">
      <span class="playlist">{{ playlistName }}</span>
      <span>Round {{ game.round }}/{{ game.totalRounds }}</span>
      <span>{{ game.score }} pts</span>
    </div>

    <div class="stage">
      <button
        type="button"
        class="play"
        :class="game.phase"
        :disabled="game.phase === 'loading' || revealed"
        :aria-label="playLabel"
        @click="game.play()"
      >
        <span v-if="game.phase === 'loading'" class="spinner" aria-hidden="true" />
        <span v-else-if="game.phase === 'playing'" class="bars" aria-hidden="true"><i /><i /><i /></span>
        <svg v-else viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5.5v13l10.5-6.5z" /></svg>
      </button>
      <p class="clip-length" aria-live="polite">
        <template v-if="revealed">Round over</template>
        <template v-else-if="game.phase === 'loading'">Loading song…</template>
        <template v-else>
          <strong>{{ formatSeconds(game.clipMs) }}</strong> clip · worth {{ POINTS[game.tier] }} pts
        </template>
      </p>
    </div>

    <TierTimeline
      :tier="game.tier"
      :attempts="game.attempts"
      :clip="game.clip"
      :won-at="revealed ? (game.lastResult?.tier ?? null) : null"
      :revealed="revealed"
    />

    <p v-if="game.error" class="notice" role="alert">{{ game.error }}</p>

    <Transition name="swap" mode="out-in">
      <div v-if="!revealed" key="guessing" class="guessing">
        <GuessInput
          ref="guessInput"
          :tracks="game.tracks"
          :wrong-ids="wrongIds"
          :skip-label="skipLabel"
          :disabled="game.phase === 'loading'"
          @guess="game.guess"
          @skip="game.skip"
          @play="game.play()"
        />

        <TransitionGroup name="row" tag="ol" class="attempts" aria-label="Previous attempts">
          <li v-for="(attempt, index) in game.attempts" :key="index">
            <span class="mark" aria-hidden="true">{{ attempt.kind === 'skip' ? '↷' : '✕' }}</span>
            <template v-if="attempt.kind === 'wrong'">
              <span>{{ attempt.track.name }}</span>
              <span class="muted">{{ attempt.track.artists.join(', ') }}</span>
            </template>
            <span v-else class="muted">Skipped</span>
          </li>
        </TransitionGroup>

        <p class="hint">
          <kbd>Space</kbd> plays the clip · <kbd>↑</kbd><kbd>↓</kbd> pick · <kbd>Enter</kbd> guesses
        </p>
      </div>

      <div v-else-if="game.current" key="answer" class="answer">
        <img v-if="game.current.image" :src="game.current.image" alt="" width="160" height="160" />
        <div class="answer-text">
          <p class="verdict">
            <template v-if="game.lastResult?.correct">
              Got it in {{ formatSeconds(TIERS_MS[game.lastResult.tier!]) }} · +{{ game.lastResult.points }}
            </template>
            <template v-else>Not this time</template>
          </p>
          <h2>{{ game.current.name }}</h2>
          <p class="muted">{{ game.current.artists.join(', ') }}</p>
          <div class="answer-actions">
            <button
              type="button"
              class="button ghost song-toggle"
              :aria-pressed="game.songPlaying"
              @click="game.toggleSong()"
            >
              <svg v-if="game.songPlaying" viewBox="0 0 24 24" aria-hidden="true">
                <path d="M7 5h3.5v14H7zM13.5 5H17v14h-3.5z" />
              </svg>
              <svg v-else viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5.5v13l10.5-6.5z" /></svg>
              {{ game.songPlaying ? 'Pause' : game.songStarted ? 'Resume' : 'Play the song' }}
            </button>
            <button v-if="!game.isLastRound" type="button" class="button primary" @click="game.nextRound()">
              Next song →
            </button>
            <button v-else type="button" class="button primary" @click="emit('finish')">See results →</button>
          </div>
        </div>
      </div>
    </Transition>
  </section>
</template>

<style scoped>
.game {
  display: grid;
  gap: 32px;
  width: min(560px, 100%);
  margin: 0 auto;
}

.status {
  display: flex;
  justify-content: space-between;
  gap: 16px;
  font: 500 12px/1 var(--mono);
  color: var(--muted);
  text-transform: uppercase;
  letter-spacing: 0.06em;
}

.playlist {
  overflow: hidden;
  max-width: 45%;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.stage {
  display: grid;
  justify-items: center;
  gap: 18px;
  padding-top: 24px;
}

.play {
  display: grid;
  place-items: center;
  width: 112px;
  height: 112px;
  border: 1px solid var(--fg);
  border-radius: 50%;
  background: var(--fg);
  color: var(--bg);
  transition:
    transform var(--ease),
    background-color var(--ease),
    color var(--ease);
}

.play:hover:not(:disabled) {
  transform: scale(1.04);
}

.play:active:not(:disabled) {
  transform: scale(0.97);
}

.play.playing {
  background: var(--bg);
  color: var(--fg);
}

.play:disabled {
  border-color: var(--line-strong);
  background: transparent;
  color: var(--muted);
  cursor: default;
}

.play svg {
  width: 40px;
  height: 40px;
  margin-left: 4px;
  fill: currentColor;
}

.bars {
  display: flex;
  align-items: center;
  gap: 5px;
  height: 36px;
}

.bars i {
  width: 5px;
  height: 100%;
  border-radius: 3px;
  background: currentColor;
  animation: bounce 0.5s ease-in-out infinite alternate;
}

.bars i:nth-child(2) {
  animation-delay: -0.2s;
}

.bars i:nth-child(3) {
  animation-delay: -0.35s;
}

.spinner {
  width: 32px;
  height: 32px;
  border: 2px solid var(--line-strong);
  border-top-color: var(--fg);
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

.clip-length {
  margin: 0;
  color: var(--muted);
}

.clip-length strong {
  color: var(--fg);
  font-family: var(--mono);
  font-weight: 500;
}

.guessing {
  display: grid;
  gap: 20px;
}

.attempts {
  display: grid;
  gap: 8px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.attempts li {
  display: flex;
  align-items: baseline;
  gap: 10px;
  padding: 10px 14px;
  border: 1px solid var(--line);
  border-radius: 10px;
  font-size: 14px;
}

.mark {
  width: 14px;
  color: var(--muted);
  font-family: var(--mono);
}

.hint {
  margin: 0;
  color: var(--faint);
  font-size: 13px;
  text-align: center;
}

.answer {
  display: flex;
  align-items: center;
  gap: 24px;
}

.answer img {
  width: 160px;
  height: 160px;
  flex: none;
  border-radius: 12px;
  object-fit: cover;
  filter: grayscale(1);
  animation: develop 0.8s ease-out both;
}

.answer-text {
  display: grid;
  gap: 6px;
  min-width: 0;
}

.verdict {
  margin: 0;
  font: 500 12px/1.4 var(--mono);
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--muted);
}

h2 {
  margin: 0;
  font-size: clamp(26px, 6vw, 36px);
  line-height: 1.05;
  letter-spacing: -0.02em;
  overflow-wrap: anywhere;
}

.answer-text .muted {
  margin: 0;
}

.song-toggle {
  min-width: 10.5em;
}

.song-toggle svg {
  width: 16px;
  height: 16px;
  fill: currentColor;
}

.answer-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  margin-top: 14px;
}

/* Guess box ⇄ answer card */
.swap-enter-active,
.swap-leave-active {
  transition:
    opacity var(--ease-slow),
    transform var(--ease-slow);
}

.swap-enter-from {
  opacity: 0;
  transform: translateY(12px);
}

.swap-leave-to {
  opacity: 0;
  transform: translateY(-8px);
}

/* New attempt rows slide in */
.row-enter-active {
  transition:
    opacity var(--ease),
    transform var(--ease);
}

.row-enter-from {
  opacity: 0;
  transform: translateY(-6px);
}

@keyframes bounce {
  from {
    transform: scaleY(0.3);
  }
  to {
    transform: scaleY(1);
  }
}

@keyframes spin {
  to {
    transform: rotate(1turn);
  }
}

/* The cover fades up out of the dark, like a photo developing. */
@keyframes develop {
  from {
    opacity: 0;
    filter: grayscale(1) brightness(0.2);
    transform: scale(0.96);
  }
}

@media (max-width: 520px) {
  .answer {
    flex-direction: column;
    align-items: flex-start;
  }

  .answer img {
    width: 120px;
    height: 120px;
  }

  .hint {
    display: none;
  }
}
</style>
