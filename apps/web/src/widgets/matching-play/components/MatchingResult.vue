<template>
  <div v-if="store.result" class="matching-result">
    <div class="matching-result__summary">
      <h1 ref="heading" class="matching-result__title" tabindex="-1">{{ t('matchingPlay.result.finished', { title: store.title }) }}</h1>
      <p v-if="store.timedOut" class="matching-result__note">{{ t('matchingPlay.result.timedOutNote') }}</p>
      <p class="matching-result__percent">{{ t('play.percent', { percent: store.result.percent }) }}</p>
      <p v-if="store.result.grade !== null" class="matching-result__grade">{{ t('play.grade', { grade: store.result.grade }) }}</p>
      <p class="matching-result__stat">
        {{ t('play.correctOf', { correct: store.result.correctCount, total: store.result.totalCount }) }}
      </p>
      <p v-if="store.timer.mode === 'stopwatch' && store.elapsedSeconds !== null" class="matching-result__stat">
        {{ t('play.timer.elapsed', { time: formatClock(store.elapsedSeconds) }) }}
      </p>
    </div>

    <template v-if="store.review">
      <h2 class="matching-result__review-title">{{ t('matchingPlay.result.reviewTitle') }}</h2>
      <p class="matching-result__legend">{{ t('matchingPlay.result.legend') }}</p>
      <ol class="matching-result__list">
        <ReviewRow
          v-for="(item, index) in store.review"
          :key="index"
          :number="index + 1"
          :definition="store.definitions[index] ?? ''"
          :answer="answerAt(index)"
          :correct="item.correct"
          :right="item.term"
        />
      </ol>
    </template>
    <p v-else class="matching-result__hidden">{{ t('matchingPlay.result.hidden') }}</p>

    <button class="matching-result__again" type="button" :disabled="store.busy" @click="store.start()">
      {{ t('play.again') }}
    </button>
  </div>
</template>

<script setup lang="ts">
import { onMounted, useTemplateRef } from 'vue'
import { useI18n } from '#imports'
import { formatClock } from '@/features/play-session'
import { useMatchingPlayStore } from '../store'
import ReviewRow from './ReviewRow.vue'

const { t } = useI18n()
const store = useMatchingPlayStore()
const heading = useTemplateRef<HTMLElement>('heading')

function answerAt(index: number): string | null {
  const term = store.placements[index] ?? null
  return term === null ? null : (store.terms[term] ?? null)
}

onMounted(() => heading.value?.focus())
</script>

<style scoped lang="scss">
@use '@/assets/styles/mixins' as *;

.matching-result {
  display: flex;
  flex-direction: column;
}

.matching-result__summary {
  display: flex;
  flex-direction: column;
  align-items: center;
  margin-top: 16px;
  padding: 28px 20px 24px;
  border-radius: 22px;
  text-align: center;
  @include card-surface;
}

.matching-result__title {
  margin: 0;
  border-radius: 8px;
  font-size: 20px;
  font-weight: 600;
  line-height: 1.4;
  overflow-wrap: anywhere;
}

.matching-result__note {
  margin: 12px 0 0;
  color: var(--color-text-muted);
  font-size: 17px;
  font-weight: 500;
  line-height: 1.4;
}

.matching-result__percent {
  margin: 12px 0 0;
  color: var(--color-blue);
  font-family: var(--font-display);
  font-size: 68px;
  font-weight: 700;
  line-height: 1.1;
  white-space: nowrap;
}

.matching-result__grade {
  margin: 16px 0 0;
  padding: 10px 24px;
  border-radius: 999px;
  background: rgb(var(--rgb-green) / 0.14);
  font-size: 24px;
  font-weight: 700;
  line-height: 1.3;
}

.matching-result__stat {
  margin: 14px 0 0;
  font-size: 20px;
  font-weight: 600;
  line-height: 1.35;

  & + & {
    margin-top: 4px;
    color: var(--color-text-muted);
  }
}

.matching-result__hidden {
  margin: 16px 0 0;
  color: var(--color-text-muted);
  font-size: 16px;
  line-height: 1.4;
  text-align: center;
}

.matching-result__review-title {
  margin: 32px 0 4px;
  font-size: 22px;
  font-weight: 700;
  line-height: 1.3;
}

.matching-result__legend {
  margin: 0 0 14px;
  color: var(--color-text-muted);
  font-size: 16px;
  line-height: 1.4;
}

.matching-result__list {
  display: flex;
  flex-direction: column;
  gap: 14px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.matching-result__again {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  min-height: 60px;
  margin-top: 28px;
  padding: 8px 20px;
  border: 0;
  border-radius: 999px;
  background: var(--color-orange);
  box-shadow: 0 10px 24px rgb(var(--rgb-orange) / 0.4);
  color: var(--color-white);
  font: inherit;
  font-size: 20px;
  font-weight: 700;
  line-height: 1.25;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
  transition:
    box-shadow 0.2s ease,
    transform 0.2s ease;

  @media (hover: hover) {
    &:hover:not(:disabled) {
      box-shadow: 0 14px 28px rgb(var(--rgb-orange) / 0.45);
    }
  }

  &:active:not(:disabled) {
    transform: scale(0.98);
  }

  &:disabled {
    cursor: progress;
    opacity: 0.7;
    box-shadow: none;
  }

  @media (prefers-reduced-motion: reduce) {
    transition: none;

    &:active:not(:disabled) {
      transform: none;
    }
  }
}
</style>
