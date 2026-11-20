<template>
  <li class="review-row" :class="`review-row--${state}`">
    <p class="review-row__text">
      <span class="review-row__sr-only">{{ t('matchingPlay.definitionNumber', { number }) }}</span>{{ definition }}
      <span v-if="state !== 'correct'" class="review-row__right">{{ t('matchingPlay.result.rightAnswer') }} <b>{{ right }}</b></span>
    </p>
    <div class="review-row__cell">
      <span class="review-row__mark"><i aria-hidden="true">{{ MARKS[state] }}</i>{{ t(`matchingPlay.result.${state}`) }}</span>
      <span v-if="answer !== null" class="review-row__answer">
        <span class="review-row__sr-only">{{ t('matchingPlay.result.yourAnswer') }}</span> {{ answer }}
      </span>
      <span v-else class="review-row__answer review-row__answer--none">{{ t('matchingPlay.result.noAnswer') }}</span>
    </div>
  </li>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from '#imports'

const MARKS = { correct: '✓', wrong: '✗', empty: '–' } as const

const props = defineProps<{
  number: number
  definition: string
  // Слово ученика; null — не поставлено
  answer: string | null
  correct: boolean
  // Правильное слово — из review сервера
  right: string
}>()

const { t } = useI18n()

const state = computed(() => {
  if (props.answer === null) return 'empty'
  return props.correct ? 'correct' : 'wrong'
})
</script>

<style scoped lang="scss">
@use '@/assets/styles/breakpoints.module' as *;

// Тот же ряд, что в игре: клетка со словом ученика и пометкой, справа определение
.review-row {
  display: grid;
  grid-template-columns: clamp(132px, 38%, 164px) minmax(0, 1fr);
  grid-template-areas: 'cell text';
  gap: 10px;
  align-items: center;
  padding: 12px 0;
  border-top: 1px solid var(--g-divider);

  &:first-child {
    border-top-color: transparent;
  }

  @include tablet {
    grid-template-columns: 220px minmax(0, 1fr);
    gap: 0 16px;
  }
}

.review-row__text {
  grid-area: text;
  margin: 0;
  color: var(--g-text);
  font-size: 15px;
  font-weight: 500;
  line-height: 1.4;
  overflow-wrap: anywhere;

  @include tablet {
    font-size: 16px;
  }
}

.review-row__sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip-path: inset(50%);
  white-space: nowrap;
}

.review-row__right {
  display: block;
  margin-top: 6px;
  font-weight: 500;

  b {
    padding: 1px 6px;
    border-radius: 6px;
    background: var(--g-ok-soft);
  }
}

.review-row__cell {
  display: flex;
  flex-direction: column;
  grid-area: cell;
  gap: 6px;
  min-height: 64px;
  padding: 8px 10px;
  border: 3px solid var(--g-ok);
  border-radius: 16px;
  background: var(--g-ok-soft);
  color: var(--g-text);

  .review-row--wrong & {
    border-color: var(--g-bad);
    background: var(--g-bad-soft);
  }

  .review-row--empty & {
    border-style: dashed;
    border-color: var(--g-line);
    background: var(--g-surface);
  }
}

// Верность пары — значок, слово и рамка, не только цвет
.review-row__mark {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 14px;
  font-weight: 700;

  i {
    display: grid;
    flex: none;
    place-items: center;
    width: 22px;
    height: 22px;
    border-radius: 50%;
    background: var(--g-ok);
    color: var(--g-on-ok);
    font-size: 13px;
    font-style: normal;
    font-weight: 800;

    .review-row--wrong & {
      background: var(--g-bad);
      color: var(--g-on-bad);
    }

    .review-row--empty & {
      background: var(--g-muted);
      color: var(--g-sticky);
    }
  }
}

.review-row__answer {
  font-size: 16px;
  font-weight: 700;
  line-height: 1.3;
  overflow-wrap: anywhere;

  &--none {
    color: var(--g-muted);
    font-size: 14px;
    font-weight: 600;
  }
}
</style>
