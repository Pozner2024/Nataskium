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
      <button class="matching-result__again" type="button" :disabled="store.busy" @click="store.start()">
        {{ t('play.again') }}
      </button>
    </div>

    <div v-if="store.review" class="matching-result__review">
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
    </div>
    <p v-else class="matching-result__hidden">{{ t('matchingPlay.result.hidden') }}</p>
  </div>
</template>

<script setup lang="ts">
import { onMounted, useTemplateRef } from 'vue'
import { useI18n } from '#imports'
import { formatClock } from '@/features/play-session'
import { focusInPlace } from '@/shared'
import { useMatchingPlayStore } from '../store'
import ReviewRow from './ReviewRow.vue'

const { t } = useI18n()
const store = useMatchingPlayStore()
const heading = useTemplateRef<HTMLElement>('heading')

function answerAt(index: number): string | null {
  const term = store.placements[index] ?? null
  return term === null ? null : (store.terms[term] ?? null)
}

onMounted(() => focusInPlace(heading.value))
</script>

<style scoped lang="scss">
@use '@/assets/styles/mixins' as *;
@use '@/assets/styles/breakpoints.module' as *;

// Итог лежит на фоне проигрывателя. Десктоп: сводка слева (липнет), пары справа
.matching-result {
  display: flex;
  flex-direction: column;
  padding-top: 8px;
  color: var(--g-text);

  @include tablet {
    padding: 24px 24px 28px;
  }

  @include desktop {
    display: grid;
    grid-template-columns: 300px minmax(0, 1fr);
    gap: 32px;
    align-items: start;
    padding: 32px 24px;
  }
}

.matching-result__summary {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;

  @include tablet {
    width: 100%;
    max-width: 520px;
    margin: 0 auto 8px;
  }

  @include desktop {
    position: sticky;
    top: 16px;
    max-width: none;
    margin: 0;
    padding: 24px 16px;
    border-radius: 20px;
    background: var(--g-surface);
    box-shadow: inset 0 0 0 1px var(--g-divider);
  }
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
  color: var(--g-muted);
  font-size: 17px;
  font-weight: 500;
  line-height: 1.4;
}

.matching-result__percent {
  margin: 12px 0 0;
  color: var(--g-accent);
  font-family: var(--font-display);
  font-size: 68px;
  font-weight: 700;
  line-height: 1.1;
  white-space: nowrap;

  @include tablet {
    font-size: 60px;
  }
}

.matching-result__grade {
  margin: 16px 0 0;
  padding: 10px 24px;
  border-radius: 999px;
  background: var(--g-ok-soft);
  box-shadow: inset 0 0 0 2px var(--g-ok);
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
    color: var(--g-muted);
  }
}

.matching-result__again {
  @include play-action;

  min-height: 60px;
  margin-top: 28px;
  font-size: 20px;

  &:disabled {
    cursor: progress;
  }
}

.matching-result__hidden {
  margin: 16px 0 0;
  color: var(--g-muted);
  font-size: 16px;
  line-height: 1.4;
  text-align: center;
}

.matching-result__review-title {
  margin: 32px 0 4px;
  font-size: 22px;
  font-weight: 700;
  line-height: 1.3;

  @include desktop {
    margin-top: 0;
  }
}

.matching-result__legend {
  margin: 0 0 14px;
  color: var(--g-muted);
  font-size: 16px;
  line-height: 1.4;
}

.matching-result__list {
  display: flex;
  flex-direction: column;
  margin: 0;
  padding: 0;
  list-style: none;
}
</style>
