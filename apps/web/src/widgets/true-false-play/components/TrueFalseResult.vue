<template>
  <div v-if="store.result" class="true-false-result">
    <div class="true-false-result__summary">
      <h1 ref="heading" class="true-false-result__title" tabindex="-1">{{ t('play.trueFalse.finished', { title: store.title }) }}</h1>
      <p v-if="store.timedOut" class="true-false-result__note">{{ t('play.trueFalse.timedOutNote') }}</p>
      <p class="true-false-result__percent">{{ t('play.percent', { percent: store.result.percent }) }}</p>
      <p v-if="store.result.grade !== null" class="true-false-result__grade">{{ t('play.grade', { grade: store.result.grade }) }}</p>
      <p class="true-false-result__stat">
        {{ t('play.correctOf', { correct: store.result.correctCount, total: store.result.totalCount }) }}
      </p>
      <p v-if="store.timer.mode === 'stopwatch' && store.elapsedSeconds !== null" class="true-false-result__stat">
        {{ t('play.timer.elapsed', { time: formatClock(store.elapsedSeconds) }) }}
      </p>
      <button class="true-false-result__again" type="button" :disabled="store.busy" @click="store.start()">
        {{ t('play.again') }}
      </button>
    </div>

    <div v-if="store.review" class="true-false-result__review">
      <h2 class="true-false-result__review-title">{{ t('play.trueFalse.reviewTitle') }}</h2>
      <p class="true-false-result__legend">{{ t('play.trueFalse.legend') }}</p>
      <ol class="true-false-result__list">
        <ReviewRow
          v-for="(item, index) in store.review"
          :key="index"
          :number="index + 1"
          :statement="store.statements[index] ?? ''"
          :answer="store.answers[index] ?? null"
          :correct="item.correct"
          :right="item.answer"
        />
      </ol>
    </div>
    <p v-else class="true-false-result__hidden">{{ t('play.trueFalse.hidden') }}</p>
  </div>
</template>

<script setup lang="ts">
import { onMounted, useTemplateRef } from 'vue'
import { useI18n } from '#imports'
import { formatClock } from '@/features/play-session'
import { focusInPlace } from '@/shared'
import { useTrueFalsePlayStore } from '../store'
import ReviewRow from './ReviewRow.vue'

const { t } = useI18n()
const store = useTrueFalsePlayStore()
const heading = useTemplateRef<HTMLElement>('heading')

onMounted(() => focusInPlace(heading.value))
</script>

<style scoped lang="scss">
@use '@/assets/styles/mixins' as *;

.true-false-result {
  display: flex;
  flex-direction: column;
  padding-top: 8px;
  color: var(--g-text);
}

.true-false-result__summary {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
}

.true-false-result__title {
  margin: 0;
  border-radius: 8px;
  font-size: 20px;
  font-weight: 600;
  line-height: 1.4;
  overflow-wrap: anywhere;
}

.true-false-result__note {
  margin: 12px 0 0;
  color: var(--g-muted);
  font-size: 17px;
  font-weight: 500;
  line-height: 1.4;
}

.true-false-result__percent {
  margin: 12px 0 0;
  color: var(--g-accent);
  font-family: var(--font-display);
  font-size: 60px;
  font-weight: 700;
  line-height: 1.1;
  white-space: nowrap;
}

.true-false-result__grade {
  margin: 16px 0 0;
  padding: 8px 20px;
  border-radius: 999px;
  background: var(--g-ok-soft);
  box-shadow: inset 0 0 0 2px var(--g-ok);
  font-size: 22px;
  font-weight: 700;
  line-height: 1.3;
}

.true-false-result__stat {
  margin: 12px 0 0;
  font-size: 18px;
  font-weight: 600;
  line-height: 1.35;

  & + & {
    margin-top: 4px;
    color: var(--g-muted);
  }
}

.true-false-result__again {
  @include play-action;

  margin-top: 28px;

  &:disabled {
    cursor: progress;
  }
}

.true-false-result__hidden {
  margin: 16px 0 0;
  color: var(--g-muted);
  font-size: 16px;
  line-height: 1.4;
  text-align: center;
}

.true-false-result__review-title {
  margin: 32px 0 4px;
  font-size: 22px;
  font-weight: 700;
  line-height: 1.3;
}

.true-false-result__legend {
  margin: 0 0 14px;
  color: var(--g-muted);
  font-size: 16px;
  line-height: 1.4;
}

.true-false-result__list {
  display: flex;
  flex-direction: column;
  margin: 0;
  padding: 0;
  list-style: none;
}
</style>
