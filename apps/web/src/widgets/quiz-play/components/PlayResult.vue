<template>
  <div v-if="store.result" class="play-result">
    <h1 ref="heading" class="play-result__title" tabindex="-1">{{ t('play.finished', { title: store.title }) }}</h1>
    <p v-if="store.timedOut" class="play-result__note">{{ t('play.timer.timedOutNote') }}</p>
    <p class="play-result__percent">{{ t('play.percent', { percent: store.result.percent }) }}</p>

    <p v-if="store.result.grade !== null" class="play-result__grade">
      {{ t('play.grade', { grade: store.result.grade }) }}
    </p>
    <template v-else>
      <p class="play-result__stat">
        {{ t('play.correctOf', { correct: store.result.correctCount, total: store.result.totalCount }) }}
      </p>
      <p class="play-result__stat">{{ t('play.partial', { count: store.result.partialCount }) }}</p>
    </template>

    <p v-if="store.timer.mode === 'stopwatch' && store.elapsedSeconds !== null" class="play-result__stat">
      {{ t('play.timer.elapsed', { time: formatClock(store.elapsedSeconds) }) }}
    </p>

    <button class="play-result__again" type="button" :disabled="store.busy" @click="store.start()">
      {{ t('play.again') }}
    </button>
  </div>
</template>

<script setup lang="ts">
import { onMounted, useTemplateRef } from 'vue'
import { useI18n } from '#imports'
import { formatClock } from '@/features/play-session'
import { focusInPlace } from '@/shared'
import { usePlayStore } from '../store'

const { t } = useI18n()
const store = usePlayStore()
const heading = useTemplateRef<HTMLElement>('heading')

onMounted(() => focusInPlace(heading.value))
</script>

<style scoped lang="scss">
@use '@/assets/styles/mixins' as *;
@use '@/assets/styles/breakpoints.module' as *;

// Итог лежит прямо на фоне проигрывателя, без карточки
.play-result {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 28px 0 24px;
  color: var(--g-text);
  text-align: center;

  @include tablet {
    width: 100%;
    max-width: 560px;
    margin: auto;
  }
}

.play-result__title {
  margin: 0;
  border-radius: 8px;
  font-size: 18px;
  font-weight: 600;
  line-height: 1.4;
  overflow-wrap: anywhere;
}

.play-result__note {
  margin: 12px 0 0;
  color: var(--g-muted);
  font-size: 16px;
  font-weight: 500;
  line-height: 1.4;
}

.play-result__percent {
  margin: 12px 0 0;
  color: var(--g-accent);
  font-family: var(--font-display);
  font-size: 60px;
  font-weight: 700;
  line-height: 1.1;
  white-space: nowrap;
}

.play-result__grade {
  margin: 16px 0 0;
  padding: 8px 20px;
  border-radius: 999px;
  background: var(--g-ok-soft);
  box-shadow: inset 0 0 0 2px var(--g-ok);
  font-size: 22px;
  font-weight: 700;
  line-height: 1.3;
}

.play-result__stat {
  margin: 12px 0 0;
  font-size: 18px;
  font-weight: 600;
  line-height: 1.35;

  & + & {
    margin-top: 4px;
    color: var(--g-muted);
  }
}

.play-result__again {
  @include play-action;

  margin-top: 28px;

  &:disabled {
    cursor: progress;
  }
}
</style>
