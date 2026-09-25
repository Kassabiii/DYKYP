<script setup lang="ts">
import { computed } from 'vue'
import type { RoundResult } from '../game/useGame'
import { POINTS, TIERS_MS, formatSeconds } from '../game/rules'

const props = defineProps<{
  score: number
  history: RoundResult[]
  playlistName: string
}>()

const emit = defineEmits<{ again: []; change: [] }>()

const correct = computed(() => props.history.filter((r) => r.correct).length)
const maxScore = computed(() => props.history.length * POINTS[0])
</script>

<template>
  <section class="results">
    <p class="eyebrow">{{ playlistName }}</p>
    <h1>
      {{ score }}<span class="of"> / {{ maxScore }}</span>
    </h1>
    <p class="muted summary">You named {{ correct }} of {{ history.length }} songs.</p>

    <ol class="rounds">
      <li v-for="(result, index) in history" :key="result.track.id" :style="{ '--i': index }">
        <img v-if="result.track.image" :src="result.track.image" alt="" width="44" height="44" loading="lazy" />
        <span class="text">
          <span class="name">{{ result.track.name }}</span>
          <span class="muted">{{ result.track.artists.join(', ') }}</span>
        </span>
        <span class="when">{{ result.correct ? formatSeconds(TIERS_MS[result.tier!]) : '—' }}</span>
        <span class="points">+{{ result.points }}</span>
      </li>
    </ol>

    <div class="actions">
      <button type="button" class="button primary" @click="emit('again')">Play again</button>
      <button type="button" class="button ghost" @click="emit('change')">Another playlist</button>
    </div>
  </section>
</template>

<style scoped>
.results {
  display: grid;
  gap: 18px;
  width: min(600px, 100%);
  margin: 0 auto;
}

.eyebrow {
  margin: 0;
  font: 500 12px/1 var(--mono);
  color: var(--muted);
  text-transform: uppercase;
  letter-spacing: 0.06em;
}

h1 {
  margin: 0;
  font-size: clamp(64px, 16vw, 120px);
  font-weight: 700;
  line-height: 0.9;
  letter-spacing: -0.05em;
  font-variant-numeric: tabular-nums;
}

.of {
  color: var(--faint);
  font-size: 0.3em;
  letter-spacing: -0.02em;
}

.summary {
  margin: 0 0 12px;
  font-size: 18px;
}

.rounds {
  display: grid;
  margin: 0;
  padding: 0;
  list-style: none;
  border-top: 1px solid var(--line);
}

.rounds li {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 12px 0;
  border-bottom: 1px solid var(--line);
  animation: rise 0.4s cubic-bezier(0.2, 0.7, 0.2, 1) both;
  animation-delay: calc(var(--i) * 50ms);
}

.rounds img {
  width: 44px;
  height: 44px;
  border-radius: 6px;
  filter: grayscale(1);
}

.text {
  display: grid;
  gap: 2px;
  min-width: 0;
  margin-right: auto;
  font-size: 14px;
}

.name {
  overflow: hidden;
  font-weight: 500;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.text .muted {
  font-size: 13px;
}

.when,
.points {
  font: 500 13px/1 var(--mono);
  font-variant-numeric: tabular-nums;
}

.when {
  color: var(--muted);
}

.points {
  min-width: 3.5em;
  text-align: right;
}

.actions {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  margin-top: 12px;
}

@keyframes rise {
  from {
    opacity: 0;
    transform: translateY(6px);
  }
}
</style>
