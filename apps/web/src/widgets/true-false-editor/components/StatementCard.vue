<template>
  <li class="statement-card" :class="{ 'statement-card--invalid': statementError !== undefined || answerError !== undefined }">
    <span class="statement-card__number" aria-hidden="true">{{ number }}</span>
    <div class="statement-card__head">
      <h3 class="statement-card__name">{{ t('teacher.trueFalseEditor.statementTitle', { n: number }) }}</h3>
      <button
        v-if="store.canRemoveItem"
        class="statement-card__remove"
        type="button"
        :aria-label="t('teacher.trueFalseEditor.removeItem', { n: number })"
        @click="store.removeItem(index)"
      >
        {{ t('teacher.trueFalseEditor.remove') }}
      </button>
    </div>

    <div class="statement-card__fields">
      <label class="statement-card__label" :for="`${idPrefix}-statement`">
        {{ t('teacher.trueFalseEditor.statementLabel') }}
        <span class="statement-card__counter" aria-hidden="true">
          {{ t('teacher.trueFalseEditor.counter', { count: item.statement.length, max: TRUE_FALSE_STATEMENT_MAX_LENGTH }) }}
        </span>
      </label>
      <textarea
        :id="`${idPrefix}-statement`"
        v-model="item.statement"
        class="statement-card__statement"
        :rows="statementRows"
        :maxlength="TRUE_FALSE_STATEMENT_MAX_LENGTH"
        :placeholder="t('teacher.trueFalseEditor.statementPlaceholder')"
        :aria-invalid="statementError !== undefined"
        :aria-describedby="describedBy"
      />
      <span :id="`${idPrefix}-statement-count`" class="statement-card__sr-only">
        {{ t('teacher.trueFalseEditor.statementCounter', { n: number, count: item.statement.length, max: TRUE_FALSE_STATEMENT_MAX_LENGTH }) }}
      </span>
      <p v-if="statementError" :id="`${idPrefix}-statement-error`" class="statement-card__error" role="alert">{{ statementError }}</p>

      <fieldset class="statement-card__answer" :aria-describedby="answerError ? `${idPrefix}-answer-error` : undefined">
        <legend class="statement-card__legend">{{ t('teacher.trueFalseEditor.answerLabel', { n: number }) }}</legend>
        <div class="statement-card__options">
          <label class="statement-card__option statement-card__option--true">
            <input
              class="statement-card__radio"
              type="radio"
              :name="`${idPrefix}-answer`"
              :checked="item.answer === true"
              :aria-invalid="answerError !== undefined"
              @change="store.setAnswer(index, true)"
            >
            <svg class="statement-card__icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>
            {{ t('teacher.trueFalseEditor.answerTrue') }}
          </label>
          <label class="statement-card__option statement-card__option--false">
            <input
              class="statement-card__radio"
              type="radio"
              :name="`${idPrefix}-answer`"
              :checked="item.answer === false"
              :aria-invalid="answerError !== undefined"
              @change="store.setAnswer(index, false)"
            >
            <svg class="statement-card__icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M6.5 6.5l11 11M17.5 6.5l-11 11" /></svg>
            {{ t('teacher.trueFalseEditor.answerFalse') }}
          </label>
        </div>
        <p v-if="answerError" :id="`${idPrefix}-answer-error`" class="statement-card__error" role="alert">{{ answerError }}</p>
      </fieldset>
    </div>
  </li>
</template>

<script setup lang="ts">
import { TRUE_FALSE_STATEMENT_MAX_LENGTH } from '@nataskium/shared/schemas'
import { computed } from 'vue'
import { useI18n } from '#imports'
import { issueText } from '../trueFalseErrors'
import { useTrueFalseEditorStore } from '../store'

const props = defineProps<{
  index: number
}>()

const { t } = useI18n()
const store = useTrueFalseEditorStore()

const item = computed(() => store.items[props.index] ?? { statement: '', answer: null })
const number = computed(() => props.index + 1)
const idPrefix = computed(() => `item-${props.index}`)
const statementError = computed(() => {
  const key = `items.${props.index}.statement`
  const error = store.errorOf(key)
  return error === undefined ? undefined : issueText(key, error, t)
})
const answerError = computed(() => {
  const key = `items.${props.index}.answer`
  const error = store.errorOf(key)
  return error === undefined ? undefined : issueText(key, error, t)
})
const describedBy = computed(() => {
  const count = `${idPrefix.value}-statement-count`
  return statementError.value === undefined ? count : `${idPrefix.value}-statement-error ${count}`
})
// Высота поля растёт с текстом: утверждение до 200 символов видно целиком без прокрутки внутри поля
const MIN_STATEMENT_ROWS = 3
const CHARS_PER_ROW_ON_PHONE = 26
const statementRows = computed(() => Math.max(MIN_STATEMENT_ROWS, Math.ceil(item.value.statement.length / CHARS_PER_ROW_ON_PHONE) + 1))
</script>

<style scoped lang="scss">
@use '@/assets/styles/mixins' as *;

.statement-card {
  display: grid;
  grid-template-columns: 40px minmax(0, 1fr);
  gap: 10px 14px;
  padding: 16px;
  border-radius: 22px;
  list-style: none;
  @include card-surface;
}

// Рамка карточки с ошибкой видна при быстрой прокрутке длинного списка
.statement-card--invalid {
  padding: 14px;
  border: 3px solid var(--color-orange-dark);
}

.statement-card__number {
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

.statement-card__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  min-width: 0;
}

.statement-card__name {
  margin: 0;
  font-size: 19px;
  font-weight: 700;
  line-height: 1.3;
}

.statement-card__remove {
  display: inline-flex;
  flex: none;
  align-items: center;
  justify-content: center;
  min-height: 48px;
  padding: 0 16px;
  border: 0;
  border-radius: 14px;
  background: rgb(var(--rgb-orange) / 0.14);
  color: var(--color-text);
  font: inherit;
  font-size: 16px;
  font-weight: 700;
  line-height: 1.2;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
  transition: background-color 0.2s ease;

  @media (hover: hover) {
    &:hover {
      background: rgb(var(--rgb-orange) / 0.22);
    }
  }

  &:active {
    background: rgb(var(--rgb-orange) / 0.3);
  }

  @media (prefers-reduced-motion: reduce) {
    transition: none;
  }
}

.statement-card__fields {
  display: flex;
  flex-direction: column;
  grid-column: 1 / -1;
  gap: 8px;
}

.statement-card__label {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 8px;
  margin-top: 6px;
  font-size: 17px;
  font-weight: 600;
  line-height: 1.3;
}

.statement-card__counter {
  color: var(--color-text-muted);
  font-size: 14px;
  font-weight: 500;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}

.statement-card__statement {
  width: 100%;
  min-height: 104px;
  padding: 14px 16px;
  border: 2px solid var(--color-text-muted);
  border-radius: 16px;
  background: var(--color-white);
  color: var(--color-text);
  font: inherit;
  font-size: 18px;
  line-height: 1.4;
  resize: vertical;
  transition: border-color 0.2s ease;

  &::placeholder {
    color: var(--color-text-muted);
    font-weight: 400;
  }

  &:focus {
    border-color: var(--color-blue-dark);
  }

  &[aria-invalid='true'] {
    border-color: var(--color-orange-dark);
  }

  @media (prefers-reduced-motion: reduce) {
    transition: none;
  }
}

// Текст ошибки тёмный, знак оранжевый: оранжево-тёмный текст на белом дал бы 3.6:1
.statement-card__error {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  margin: 0;
  font-size: 16px;
  font-weight: 500;
  line-height: 1.4;

  &::before {
    content: '!';
    content: '!' / '';
    display: grid;
    flex: none;
    place-items: center;
    width: 22px;
    height: 22px;
    margin-top: 1px;
    border-radius: 50%;
    background: var(--color-orange-dark);
    color: var(--color-white);
    font-size: 13px;
    font-weight: 700;
    line-height: 1;
  }
}

.statement-card__answer {
  min-width: 0;
  margin: 6px 0 0;
  padding: 0;
  border: 0;

  .statement-card__error {
    margin-top: 8px;
  }
}

.statement-card__legend {
  padding: 0;
  font-size: 17px;
  font-weight: 600;
  line-height: 1.3;
}

.statement-card__options {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
  margin-top: 8px;
}

// Выбранный вариант отличается значком, подписью и сплошной заливкой, а не только цветом
.statement-card__option {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  min-height: 56px;
  padding: 8px 12px;
  border: 3px solid rgb(var(--rgb-blue) / 0.3);
  border-radius: 16px;
  background: var(--color-white);
  color: var(--color-text);
  font-size: 18px;
  font-weight: 700;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
  transition: background-color 0.2s ease;

  &:has(:checked) {
    border-color: var(--color-blue-dark);
    background: var(--color-blue-dark);
    color: var(--color-white);
  }

  &:has(:focus-visible) {
    outline: 3px solid var(--color-blue-dark);
    outline-offset: 2px;
  }

  @media (prefers-reduced-motion: reduce) {
    transition: none;
  }
}

// Радиокнопка остаётся в разметке и доступна с клавиатуры, видна только подпись
.statement-card__radio {
  position: absolute;
  inset: 0;
  margin: 0;
  opacity: 0;
  cursor: pointer;
}

.statement-card__icon {
  flex: none;
  width: 22px;
  height: 22px;
  fill: none;
  stroke: currentcolor;
  stroke-width: 3;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.statement-card__sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip-path: inset(50%);
  white-space: nowrap;
}
</style>
