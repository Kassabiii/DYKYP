<script setup lang="ts">
import { TIERS_MS, formatSeconds } from '../game/rules'

defineProps<{ busy: boolean }>()
const emit = defineEmits<{ connect: [] }>()

// The Web Playback SDK does not run in mobile browsers.
const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent)
</script>

<template>
  <section class="welcome">
    <h1>Do you know<br />your playlist?</h1>
    <p class="lede">
      Pick one of your Spotify playlists. Hear
      <strong>{{ formatSeconds(TIERS_MS[0]) }}</strong> of a song. Name it — or skip, and the clip gets longer.
    </p>

    <ol class="ladder" aria-label="Clip lengths">
      <li v-for="(ms, index) in TIERS_MS" :key="ms" :style="{ '--i': index }">
        <span class="bar" />
        <span class="label">{{ formatSeconds(ms) }}</span>
      </li>
    </ol>

    <div class="cta">
      <button type="button" class="button primary large" :disabled="busy" @click="emit('connect')">
        {{ busy ? 'Connecting…' : 'Connect Spotify' }}
      </button>
      <p class="muted small">
        Needs Spotify Premium and a desktop browser (Chrome, Edge or Firefox).
        <template v-if="isMobile"><br /><strong>Phones can’t play the clips.</strong></template>
      </p>
    </div>
  </section>
</template>

<style scoped>
.welcome {
  display: grid;
  gap: 32px;
  max-width: 640px;
  padding-top: 8vh;
}

h1 {
  margin: 0;
  font-size: clamp(44px, 10vw, 88px);
  font-weight: 700;
  line-height: 0.95;
  letter-spacing: -0.045em;
}

.lede {
  max-width: 30em;
  margin: 0;
  color: var(--muted);
  font-size: 19px;
  line-height: 1.5;
}

.lede strong {
  color: var(--fg);
  font-family: var(--mono);
  font-weight: 500;
}

/* The clip lengths, drawn as bars that grow in one after another. */
.ladder {
  display: flex;
  align-items: flex-end;
  gap: 10px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.ladder li {
  display: grid;
  justify-items: center;
  gap: 8px;
}

.ladder .bar {
  width: 36px;
  height: calc(6px + var(--i) * 12px);
  border-radius: 4px;
  background: var(--fg);
  transform-origin: bottom;
  animation: grow 0.6s cubic-bezier(0.2, 0.7, 0.2, 1) both;
  animation-delay: calc(var(--i) * 70ms + 150ms);
}

.ladder .label {
  color: var(--muted);
  font: 500 11px/1 var(--mono);
}

.cta {
  display: grid;
  justify-items: start;
  gap: 14px;
}

.small {
  margin: 0;
  font-size: 14px;
  line-height: 1.5;
}

@keyframes grow {
  from {
    opacity: 0;
    transform: scaleY(0);
  }
}
</style>
