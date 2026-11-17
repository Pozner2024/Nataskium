<template>
  <div
    v-if="timer && mode !== 'none'"
    class="play-timer"
    :class="{ 'play-timer--limit': isLimit, 'play-timer--low': timer.isLow.value }"
    role="timer"
    :aria-label="t('play.timer.label')"
  >
    <svg class="play-timer__icon" viewBox="0 0 24 24" aria-hidden="true">
      <template v-if="timer.isLow.value">
        <path d="M12 4 2.5 20h19L12 4Z" />
        <path d="M12 10v4.5M12 17.5v.01" />
      </template>
      <template v-else>
        <circle cx="12" cy="13" r="8" />
        <path d="M12 9v4l2.5 2M9.5 2.5h5" />
      </template>
    </svg>
    <span class="play-timer__time">{{ formatClock(shownSeconds) }}</span>
    <span v-if="timer.isLow.value" class="play-timer__low">{{ t('play.timer.low') }}</span>
  </div>
</template>

<script setup lang="ts">
import type { QuizTimer } from '@nataskium/shared/schemas'
import { computed, inject } from 'vue'
import { useI18n } from '#imports'
import { formatClock } from './formatClock'
import { PLAY_TIMER_KEY } from './usePlayTimer'

const props = defineProps<{ mode: QuizTimer['mode'] }>()

const { t } = useI18n()
const timer = inject(PLAY_TIMER_KEY, null)

const isLimit = computed(() => props.mode === 'limit')
const shownSeconds = computed(() => (isLimit.value ? timer?.remainingSeconds.value : timer?.elapsedSeconds.value) ?? 0)
</script>

<style scoped lang="scss">
.play-timer {
  display: inline-flex;
  align-items: center;
  align-self: flex-start;
  gap: 8px;
  margin-top: 10px;
  padding: 6px 14px 6px 10px;
  border-radius: 999px;
  background: var(--color-night);
  color: var(--color-white);
}

.play-timer__icon {
  flex: none;
  width: 20px;
  height: 20px;
  fill: none;
  stroke: currentcolor;
  stroke-width: 2;
  stroke-linecap: round;
  stroke-linejoin: round;

  .play-timer--limit & {
    color: var(--color-green-light);
  }

  .play-timer--low & {
    color: var(--color-orange);
  }
}

.play-timer__time {
  font-family: var(--font-display);
  font-size: 16px;
  font-weight: 700;
  line-height: 1.3;
  font-variant-numeric: tabular-nums;
}

.play-timer__low {
  color: var(--color-orange-light);
  font-size: 14px;
  font-weight: 600;
  line-height: 1.3;
}
</style>
