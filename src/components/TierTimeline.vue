<script setup lang="ts">
// One segment per clip length. Used segments show what happened (wrong / skipped / correct),
// the current one fills up while its clip is playing.
import { computed } from 'vue'
import type { Attempt } from '../game/useGame'
import { TIERS_MS, formatSeconds } from '../game/rules'

const props = defineProps<{
  tier: number
  attempts: Attempt[]
  clip: { id: number; durationMs: number } | null
  /** Tier the song was guessed at, null if not (yet) guessed. */
  wonAt: number | null
  revealed: boolean
}>()

const segments = computed(() =>
  TIERS_MS.map((ms, index) => {
    let state: 'wrong' | 'skip' | 'won' | 'current' | 'locked' | 'missed'
    if (props.wonAt === index) state = 'won'
    else if (index < props.attempts.length) state = props.attempts[index].kind
    else if (index === props.tier && !props.revealed) state = 'current'
    else if (props.revealed) state = 'missed'
    else state = 'locked'
    return { ms, label: formatSeconds(ms), state }
  }),
)
</script>

<template>
  <ol class="timeline" aria-label="Clip lengths">
    <li
      v-for="(segment, index) in segments"
      :key="segment.ms"
      :class="segment.state"
      :aria-current="segment.state === 'current' ? 'step' : undefined"
    >
      <span class="bar">
        <span
          v-if="segment.state === 'current' && clip"
          :key="clip.id"
          class="fill"
          :style="{ animationDuration: `${clip.durationMs}ms` }"
        />
      </span>
      <span class="label">{{ segment.label }}</span>
      <span class="visually-hidden">
        {{ index < attempts.length ? `: ${attempts[index].kind === 'skip' ? 'skipped' : 'wrong'}` : '' }}
      </span>
    </li>
  </ol>
</template>

<style scoped>
.timeline {
  display: grid;
  grid-template-columns: repeat(6, 1fr);
  gap: 6px;
  margin: 0;
  padding: 0;
  list-style: none;
}

li {
  display: grid;
  gap: 8px;
}

.bar {
  position: relative;
  height: 4px;
  overflow: hidden;
  border-radius: 999px;
  background: var(--line);
  transition: background-color var(--ease-slow);
}

.fill {
  position: absolute;
  inset: 0;
  background: var(--fg);
  transform-origin: left;
  animation: fill linear forwards;
}

.label {
  font: 500 11px/1 var(--mono);
  color: var(--faint);
  text-align: center;
  transition: color var(--ease-slow);
}

.current .bar {
  background: var(--line-strong);
}
.current .label {
  color: var(--fg);
}

.wrong .bar,
.skip .bar {
  background: var(--muted);
}
.wrong .label,
.skip .label {
  color: var(--muted);
  text-decoration: line-through;
}

.won .bar {
  background: var(--fg);
}
.won .label {
  color: var(--fg);
}

@keyframes fill {
  from {
    transform: scaleX(0);
  }
  to {
    transform: scaleX(1);
  }
}
</style>
