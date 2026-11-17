<template>
  <li class="pair-card" :class="{ 'pair-card--invalid': isInvalid }">
    <span class="pair-card__number" aria-hidden="true">{{ number }}</span>
    <div class="pair-card__head">
      <h3 class="pair-card__name">{{ t('teacher.matchingEditor.pairLabel', { n: number }) }}</h3>
      <button
        class="pair-card__remove"
        type="button"
        :disabled="!store.canRemovePair"
        :aria-label="t('teacher.matchingEditor.removePair', { n: number })"
        :aria-describedby="store.canRemovePair ? undefined : 'matching-min-pairs'"
        @click="store.removePair(index)"
      >
        {{ t('teacher.matchingEditor.remove') }}
      </button>
    </div>

    <div class="pair-card__fields">
      <label class="pair-card__label" :for="`${idPrefix}-term`">
        {{ t('teacher.matchingEditor.termLabel') }}
        <span class="pair-card__counter" aria-hidden="true">
          {{ t('teacher.matchingEditor.counter', { count: pair.term.length, max: MATCHING_TERM_MAX_LENGTH }) }}
        </span>
      </label>
      <input
        :id="`${idPrefix}-term`"
        v-model="pair.term"
        class="pair-card__term"
        type="text"
        :maxlength="MATCHING_TERM_MAX_LENGTH"
        :placeholder="t('teacher.matchingEditor.termPlaceholder')"
        :aria-invalid="termError !== undefined"
        :aria-describedby="describedBy('term', termError)"
      >
      <span :id="`${idPrefix}-term-count`" class="pair-card__sr-only">
        {{ t('teacher.matchingEditor.termCounter', { n: number, count: pair.term.length, max: MATCHING_TERM_MAX_LENGTH }) }}
      </span>
      <p v-if="termError" :id="`${idPrefix}-term-error`" class="pair-card__error" role="alert">{{ termError }}</p>

      <label class="pair-card__label" :for="`${idPrefix}-definition`">
        {{ t('teacher.matchingEditor.definitionLabel') }}
        <span class="pair-card__counter" aria-hidden="true">
          {{ t('teacher.matchingEditor.counter', { count: pair.definition.length, max: MATCHING_DEFINITION_MAX_LENGTH }) }}
        </span>
      </label>
      <textarea
        :id="`${idPrefix}-definition`"
        v-model="pair.definition"
        class="pair-card__definition"
        :rows="definitionRows"
        :maxlength="MATCHING_DEFINITION_MAX_LENGTH"
        :placeholder="t('teacher.matchingEditor.definitionPlaceholder')"
        :aria-invalid="definitionError !== undefined"
        :aria-describedby="describedBy('definition', definitionError)"
      />
      <span :id="`${idPrefix}-definition-count`" class="pair-card__sr-only">
        {{ t('teacher.matchingEditor.definitionCounter', { n: number, count: pair.definition.length, max: MATCHING_DEFINITION_MAX_LENGTH }) }}
      </span>
      <p v-if="definitionError" :id="`${idPrefix}-definition-error`" class="pair-card__error" role="alert">{{ definitionError }}</p>
    </div>
  </li>
</template>

<script setup lang="ts">
import { MATCHING_DEFINITION_MAX_LENGTH, MATCHING_TERM_MAX_LENGTH } from '@nataskium/shared/schemas'
import { computed } from 'vue'
import { useI18n } from '#imports'
import { issueText } from '../matchingErrors'
import { useMatchingEditorStore, type PairField } from '../store'

const props = defineProps<{
  index: number
}>()

const { t } = useI18n()
const store = useMatchingEditorStore()

const pair = computed(() => store.matching.pairs[props.index] ?? { term: '', definition: '' })
const number = computed(() => props.index + 1)
const idPrefix = computed(() => `pair-${props.index}`)
const termError = computed(() => errorText('term'))
const definitionError = computed(() => errorText('definition'))
// Высота поля растёт с текстом: определение до 200 символов видно целиком без прокрутки внутри поля
const MIN_DEFINITION_ROWS = 3
const CHARS_PER_ROW_ON_PHONE = 26
const definitionRows = computed(() => Math.max(MIN_DEFINITION_ROWS, Math.ceil(pair.value.definition.length / CHARS_PER_ROW_ON_PHONE) + 1))
const isInvalid = computed(() => termError.value !== undefined || definitionError.value !== undefined)

function errorText(field: PairField): string | undefined {
  const key = `pairs.${props.index}.${field}`
  const error = store.errorOf(key)
  return error === undefined ? undefined : issueText(key, error, t)
}

function describedBy(field: PairField, error: string | undefined): string {
  const count = `${idPrefix.value}-${field}-count`
  return error === undefined ? count : `${idPrefix.value}-${field}-error ${count}`
}
</script>

<style scoped lang="scss">
@use '@/assets/styles/mixins' as *;

%field {
  width: 100%;
  border: 2px solid var(--color-text-muted);
  border-radius: 16px;
  background: var(--color-white);
  color: var(--color-text);
  font: inherit;
  font-size: 18px;
  line-height: 1.4;
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

.pair-card {
  display: grid;
  grid-template-columns: 40px minmax(0, 1fr);
  gap: 10px 14px;
  padding: 16px;
  border-radius: 22px;
  list-style: none;
  @include card-surface;
}

// Рамка карточки с ошибкой видна при быстрой прокрутке десяти пар
.pair-card--invalid {
  padding: 14px;
  border: 3px solid var(--color-orange-dark);
}

.pair-card__number {
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

.pair-card__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  min-width: 0;
}

.pair-card__name {
  margin: 0;
  font-size: 19px;
  font-weight: 700;
  line-height: 1.3;
}

.pair-card__remove {
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
    &:hover:not(:disabled) {
      background: rgb(var(--rgb-orange) / 0.22);
    }
  }

  &:active:not(:disabled) {
    background: rgb(var(--rgb-orange) / 0.3);
  }

  &:disabled {
    cursor: not-allowed;
    opacity: 0.45;
  }

  @media (prefers-reduced-motion: reduce) {
    transition: none;
  }
}

.pair-card__fields {
  display: flex;
  flex-direction: column;
  grid-column: 1 / -1;
  gap: 8px;
}

.pair-card__label {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 8px;
  margin-top: 6px;
  font-size: 17px;
  font-weight: 600;
  line-height: 1.3;
}

.pair-card__counter {
  color: var(--color-text-muted);
  font-size: 14px;
  font-weight: 500;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}

.pair-card__term {
  @extend %field;

  min-height: 56px;
  padding: 12px 16px;
  font-weight: 700;
}

.pair-card__definition {
  @extend %field;

  min-height: 104px;
  padding: 14px 16px;
  resize: vertical;
}

// Текст ошибки тёмный, знак оранжевый: оранжево-тёмный текст на белом дал бы 3.6:1
.pair-card__error {
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

.pair-card__sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip-path: inset(50%);
  white-space: nowrap;
}
</style>
