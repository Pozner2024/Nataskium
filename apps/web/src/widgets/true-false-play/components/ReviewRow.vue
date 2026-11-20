<template>
  <li class="review-row" :class="`review-row--${state}`">
    <p class="review-row__text">
      <span class="review-row__sr-only">{{ t('play.trueFalse.statementNumber', { number }) }}</span>{{ statement }}
      <span v-if="state !== 'correct'" class="review-row__right">
        {{ t('play.trueFalse.rightAnswer') }} <b>{{ label(right) }}</b>
      </span>
    </p>
    <div class="review-row__cell">
      <span class="review-row__mark"><i aria-hidden="true">{{ MARKS[state] }}</i>{{ t(`play.trueFalse.${state}`) }}</span>
      <span v-if="answer !== null" class="review-row__answer">
        <span class="review-row__sr-only">{{ t('play.trueFalse.yourAnswer') }}</span> {{ label(answer) }}
      </span>
      <span v-else class="review-row__answer review-row__answer--none">{{ t('play.trueFalse.noAnswer') }}</span>
    </div>
  </li>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from '#imports'

const MARKS = { correct: '✓', wrong: '✗', empty: '–' } as const

const props = defineProps<{
  number: number
  statement: string
  // Ответ ученика; null — не отвечено
  answer: boolean | null
  correct: boolean
  // Правильный ответ — из review сервера
  right: boolean
}>()

const { t } = useI18n()

const state = computed(() => {
  if (props.answer === null) return 'empty'
  return props.correct ? 'correct' : 'wrong'
})

const label = (value: boolean): string => t(value ? 'play.trueFalse.yes' : 'play.trueFalse.no')
</script>

<style scoped lang="scss">
.review-row {
  display: grid;
  grid-template-columns: clamp(112px, 34%, 150px) minmax(0, 1fr);
  grid-template-areas: 'cell text';
  gap: 10px;
  align-items: center;
  padding: 12px 0;
  border-top: 1px solid var(--g-divider);

  &:first-child {
    border-top-color: transparent;
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

// Верность ответа — значок, слово и рамка, не только цвет
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

  &--none {
    color: var(--g-muted);
    font-size: 14px;
    font-weight: 600;
  }
}
</style>
