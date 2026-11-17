<template>
  <li class="review-row" :class="`review-row--${state}`">
    <span class="review-row__number" aria-hidden="true">{{ number }}</span>
    <span class="review-row__text">
      <span class="review-row__sr-only">{{ t('matchingPlay.definitionNumber', { number }) }}</span>{{ definition }}
    </span>
    <div class="review-row__answer">
      <span v-if="answer !== null">{{ t('matchingPlay.result.yourAnswer') }} <b>{{ answer }}</b></span>
      <span v-else>{{ t('matchingPlay.result.noAnswer') }}</span>
      <span class="review-row__mark"><i aria-hidden="true">{{ MARKS[state] }}</i>{{ t(`matchingPlay.result.${state}`) }}</span>
    </div>
    <p v-if="state !== 'correct'" class="review-row__right">{{ t('matchingPlay.result.rightAnswer') }} <b>{{ right }}</b></p>
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
.review-row {
  --rgb-wrong: 199 58 58;
  --color-wrong: #c73a3a;

  display: grid;
  grid-template-columns: 40px minmax(0, 1fr);
  gap: 12px 14px;
  padding: 16px;
  border: 3px solid var(--color-green-dark);
  border-radius: 22px;
  background: rgb(var(--rgb-green) / 0.08);
}

.review-row--wrong {
  border-color: var(--color-wrong);
  background: rgb(var(--rgb-wrong) / 0.06);
}

.review-row--empty {
  border-style: dashed;
  border-color: var(--color-text-muted);
  background: #f4f5f9;
}

.review-row__number {
  display: grid;
  place-items: center;
  width: 40px;
  height: 40px;
  border-radius: 13px;
  background: rgb(var(--rgb-blue) / 0.12);
  color: var(--color-blue-dark);
  font-family: var(--font-display);
  font-size: 17px;
  font-weight: 700;
}

.review-row__text {
  align-self: center;
  font-size: 18px;
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

.review-row__answer {
  display: flex;
  flex-wrap: wrap;
  grid-column: 1 / -1;
  align-items: center;
  gap: 8px 12px;
  font-size: 18px;
  line-height: 1.35;

  b {
    overflow-wrap: anywhere;
  }
}

// Текст пометки тёмный: белый на зелёном — 4.4:1, мало для 16px. Цвет несут кружок со значком и рамка
.review-row__mark {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-height: 36px;
  padding: 3px 14px 3px 4px;
  border: 2px solid var(--color-green-dark);
  border-radius: 999px;
  background: var(--color-white);
  color: var(--color-text);
  font-size: 16px;
  font-weight: 700;

  i {
    display: grid;
    place-items: center;
    width: 26px;
    height: 26px;
    border-radius: 50%;
    background: var(--color-green-dark);
    color: var(--color-white);
    font-size: 15px;
    font-style: normal;
    font-weight: 800;
  }

  .review-row--wrong & {
    border-color: var(--color-wrong);

    i {
      background: var(--color-wrong);
    }
  }

  .review-row--empty & {
    border-color: var(--color-text-muted);

    i {
      background: var(--color-text-muted);
    }
  }
}

.review-row__right {
  grid-column: 1 / -1;
  margin: 0;
  padding-top: 10px;
  border-top: 1px solid rgb(var(--rgb-night) / 0.1);
  font-size: 18px;
  line-height: 1.35;
  overflow-wrap: anywhere;

  b {
    padding: 2px 8px;
    border-radius: 6px;
    background: rgb(var(--rgb-green) / 0.16);
  }
}
</style>
