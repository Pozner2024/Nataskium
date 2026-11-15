<template>
  <li class="question-card" :class="{ 'question-card--expanded': expanded }">
    <button
      v-if="!expanded"
      class="question-card__summary"
      type="button"
      :aria-expanded="false"
      @click="store.toggleExpanded(index)"
    >
      <span class="question-card__number">{{ index + 1 }}</span>
      <span class="question-card__summary-body">
        <span class="question-card__summary-text" :class="{ 'question-card__summary-text--empty': !question.text }">
          {{ question.text || t('teacher.quizEditor.emptyQuestion') }}
        </span>
        <span class="question-card__summary-meta">
          {{ t('teacher.quizEditor.questionMeta', { options: question.options.length, correct: correctCount }) }}
        </span>
      </span>
      <svg class="question-card__chevron" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 9l6 6 6-6" /></svg>
    </button>

    <div v-else class="question-card__body">
      <div class="question-card__head">
        <label class="question-card__label" :for="`${idPrefix}-text`">
          {{ t('teacher.quizEditor.questionLabel', { n: index + 1 }) }}
        </label>
        <div class="question-card__actions">
          <button
            class="question-card__collapse"
            type="button"
            :aria-expanded="true"
            :aria-label="t('teacher.quizEditor.collapseQuestion', { n: index + 1 })"
            @click="store.toggleExpanded(index)"
          >
            {{ t('teacher.quizEditor.collapse') }}
            <svg class="question-card__chevron" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 15l6-6 6 6" /></svg>
          </button>
          <button
            class="question-card__remove"
            type="button"
            :disabled="!canRemove"
            :aria-label="t('teacher.quizEditor.removeQuestion', { n: index + 1 })"
            @click="isRemoveOpen = true"
          >
            {{ t('teacher.quizEditor.remove') }}
          </button>
        </div>
      </div>
      <textarea
        :id="`${idPrefix}-text`"
        v-model="question.text"
        class="question-card__text"
        rows="2"
        :placeholder="t('teacher.quizEditor.questionTextPlaceholder')"
        :maxlength="QUESTION_TEXT_MAX_LENGTH"
        :aria-invalid="errorOf('text') !== undefined"
        :aria-describedby="errorOf('text') ? `${idPrefix}-text-error` : undefined"
      />
      <p v-if="errorOf('text')" :id="`${idPrefix}-text-error`" class="question-card__error" role="alert">{{ errorOf('text') }}</p>
      <ImageField
        variant="question"
        :image-url="store.questionImageUrl(index)"
        :label="t('teacher.quizEditor.image.questionLabel', { n: index + 1 })"
        @change="(image) => store.setQuestionImage(index, image)"
      />

      <p class="question-card__hint">{{ t('teacher.quizEditor.optionsHint') }}</p>
      <ul class="question-card__options">
        <li v-for="(option, optionIndex) in question.options" :key="optionKey(option)" class="question-card__option">
          <input
            class="question-card__correct"
            type="checkbox"
            :checked="option.isCorrect"
            :disabled="isLocked(optionIndex)"
            :title="isLocked(optionIndex) ? t('teacher.quizEditor.correctLocked') : undefined"
            :aria-label="t('teacher.quizEditor.correctLabel', { n: optionIndex + 1 })"
            @change="store.toggleCorrect(index, optionIndex)"
          >
          <span class="question-card__check" aria-hidden="true">
            <svg class="question-card__check-mark" viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>
            <svg class="question-card__lock" viewBox="0 0 24 24"><path d="M7 11V8a5 5 0 0 1 10 0v3M5 11h14v10H5z" /></svg>
          </span>
          <input
            v-model="option.text"
            class="question-card__option-text"
            type="text"
            :maxlength="OPTION_TEXT_MAX_LENGTH"
            :placeholder="option.imageId === null ? undefined : t('teacher.quizEditor.optionTextOptional')"
            :aria-label="t('teacher.quizEditor.optionLabel', { n: optionIndex + 1 })"
            :aria-invalid="errorOf(`options.${optionIndex}.text`) !== undefined"
          >
          <button
            class="question-card__remove-option"
            type="button"
            :disabled="question.options.length <= MIN_OPTIONS"
            :aria-label="t('teacher.quizEditor.removeOption', { n: optionIndex + 1 })"
            @click="store.removeOption(index, optionIndex)"
          >
            &times;
          </button>
          <ImageField
            class="question-card__option-image"
            variant="option"
            :image-url="store.optionImageUrl(index, optionIndex)"
            :label="t('teacher.quizEditor.image.optionLabel', { n: optionIndex + 1 })"
            @change="(image) => store.setOptionImage(index, optionIndex, image)"
          />
          <p v-if="errorOf(`options.${optionIndex}.text`)" class="question-card__error" role="alert">
            {{ errorOf(`options.${optionIndex}.text`) }}
          </p>
        </li>
      </ul>
      <p v-if="errorOf('options')" class="question-card__error" role="alert">{{ errorOf('options') }}</p>

      <AppConfirmDialog
        v-model:open="isRemoveOpen"
        :title="t('teacher.quizEditor.removeDialog.title', { n: index + 1 })"
        :text="t('teacher.quizEditor.removeDialog.text')"
        :confirm-label="t('teacher.quizEditor.removeDialog.confirm')"
        :cancel-label="t('teacher.quizEditor.removeDialog.cancel')"
        @confirm="store.removeQuestion(index)"
      />

      <button
        class="question-card__add-option"
        type="button"
        :disabled="question.options.length >= MAX_OPTIONS"
        @click="store.addOption(index)"
      >
        {{ t('teacher.quizEditor.addOption') }}
      </button>
    </div>
  </li>
</template>

<script setup lang="ts">
import { MAX_OPTIONS, MIN_OPTIONS, OPTION_TEXT_MAX_LENGTH, QUESTION_TEXT_MAX_LENGTH } from '@nataskium/shared/schemas'
import { computed, ref, toRaw } from 'vue'
import { useI18n } from '#imports'
import { AppConfirmDialog } from '@/shared'
import { issueText } from '../quizErrors'
import { useQuizEditorStore } from '../store'
import ImageField from './ImageField.vue'

const props = defineProps<{
  index: number
  expanded: boolean
}>()

const { t } = useI18n()
const store = useQuizEditorStore()

const question = computed(() => store.quiz.questions[props.index] ?? { text: '', imageId: null, options: [] })
const correctCount = computed(() => question.value.options.filter((option) => option.isCorrect).length)
const canRemove = computed(() => store.quiz.questions.length > 1)
const isRemoveOpen = ref(false)
const idPrefix = computed(() => `question-${props.index}`)

// Последний верный нельзя снять, последний неверный нельзя отметить: вопрос всегда имеет оба вида вариантов
function isLocked(optionIndex: number): boolean {
  const option = question.value.options[optionIndex]
  if (!option) return false
  return option.isCorrect ? correctCount.value === 1 : correctCount.value === question.value.options.length - 1
}

// Ключ варианта — по объекту, а не по индексу: после удаления варианта его поле картинки (и загрузка в нём)
// не достаётся соседу
const optionKeys = new WeakMap<object, number>()
let nextOptionKey = 0

function optionKey(option: object): number {
  const raw = toRaw(option)
  const known = optionKeys.get(raw)
  if (known !== undefined) return known
  optionKeys.set(raw, nextOptionKey)
  return nextOptionKey++
}

// subPath — путь внутри вопроса: `text`, `options`, `options.2.text`
function errorOf(subPath: string): string | undefined {
  const key = `questions.${props.index}.${subPath}`
  const message = store.fieldErrors[key]
  return message === undefined ? undefined : issueText(key, message, t)
}
</script>


<style scoped lang="scss">
@use '@/assets/styles/mixins' as *;

%field {
  width: 100%;
  border: 2px solid var(--color-text-muted);
  border-radius: 14px;
  background: var(--color-white);
  color: var(--color-text);
  font: inherit;
  // 16px — меньше, и iOS Safari при фокусе увеличивает страницу
  font-size: 16px;
  line-height: 1.35;
  transition: border-color 0.2s ease;

  &::placeholder {
    color: var(--color-text-muted);
  }

  &:focus {
    border-color: var(--color-blue-dark);
  }

  &[aria-invalid='true'] {
    border-color: var(--color-orange-dark);
  }
}

%soft-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 44px;
  border: 0;
  border-radius: 14px;
  font: inherit;
  font-weight: 700;
  line-height: 1.2;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
  transition: background-color 0.2s ease;

  &:disabled {
    cursor: not-allowed;
    opacity: 0.45;
  }
}

.question-card {
  border-radius: 22px;
  list-style: none;
  @include card-surface;
}

.question-card--expanded {
  border: 2px solid var(--color-blue);
}

.question-card__summary {
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
  min-height: 72px;
  padding: 12px 14px 12px 12px;
  border: 0;
  border-radius: 21px;
  background: none;
  color: var(--color-text);
  font: inherit;
  text-align: start;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
  transition: background-color 0.2s ease;

  @media (hover: hover) {
    &:hover {
      background: rgb(var(--rgb-blue) / 0.06);
    }
  }

  &:active {
    background: rgb(var(--rgb-blue) / 0.12);
  }
}

.question-card__number {
  display: grid;
  flex: none;
  place-items: center;
  width: 36px;
  height: 36px;
  border-radius: 12px;
  background: rgb(var(--rgb-blue) / 0.12);
  color: var(--color-blue-dark);
  font-family: var(--font-display);
  font-size: 15px;
  font-weight: 700;
}

.question-card__summary-body {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.question-card__summary-text {
  display: -webkit-box;
  overflow: hidden;
  font-weight: 700;
  line-height: 1.3;
  overflow-wrap: anywhere;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
}

.question-card__summary-text--empty {
  color: var(--color-text-muted);
  font-style: italic;
  font-weight: 500;
}

.question-card__summary-meta {
  color: var(--color-text-muted);
  font-size: 14px;
  line-height: 1.35;
}

.question-card__chevron {
  flex: none;
  width: 22px;
  height: 22px;
  fill: none;
  stroke: var(--color-blue-dark);
  stroke-width: 2.4;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.question-card__body {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 14px 14px 16px;
}

.question-card__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.question-card__label {
  font-size: 17px;
  font-weight: 700;
  line-height: 1.3;
}

.question-card__actions {
  display: flex;
  flex: none;
  gap: 8px;
}

.question-card__collapse {
  @extend %soft-button;

  gap: 4px;
  padding: 0 10px 0 14px;
  background: rgb(var(--rgb-blue) / 0.1);
  color: var(--color-blue-dark);

  @media (hover: hover) {
    &:hover {
      background: rgb(var(--rgb-blue) / 0.16);
    }
  }

  &:active {
    background: rgb(var(--rgb-blue) / 0.24);
  }

  .question-card__chevron {
    width: 18px;
    height: 18px;
  }
}

.question-card__remove {
  @extend %soft-button;

  flex: none;
  padding: 0 14px;
  background: rgb(var(--rgb-orange) / 0.14);
  color: var(--color-text);

  @media (hover: hover) {
    &:hover:not(:disabled) {
      background: rgb(var(--rgb-orange) / 0.22);
    }
  }

  &:active:not(:disabled) {
    background: rgb(var(--rgb-orange) / 0.3);
  }
}

.question-card__text {
  @extend %field;

  min-height: 80px;
  padding: 12px 14px;
  resize: vertical;
}

// Текст ошибки тёмный, знак оранжевый: оранжево-тёмный текст на белом дал бы 3.6:1
.question-card__error {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  margin: 0;
  font-size: 15px;
  font-weight: 500;
  line-height: 1.4;

  &::before {
    content: '!';
    content: '!' / '';
    display: grid;
    flex: none;
    place-items: center;
    width: 20px;
    height: 20px;
    margin-top: 1px;
    border-radius: 50%;
    background: var(--color-orange-dark);
    color: var(--color-white);
    font-size: 13px;
    font-weight: 700;
    line-height: 1;
  }
}

.question-card__hint {
  margin: 4px 0 0;
  color: var(--color-text-muted);
  font-size: 14px;
  line-height: 1.4;
}

.question-card__options {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.question-card__option {
  display: grid;
  grid-template-columns: 44px minmax(0, 1fr) 44px;
  align-items: center;
  gap: 6px 4px;

  .question-card__error {
    grid-column: 2 / -1;
  }
}

.question-card__option-image {
  grid-column: 1 / -1;
}

// Сама галочка прозрачная и занимает всю клетку 44×44 — цель касания; рисует её соседний __check
.question-card__correct {
  grid-area: 1 / 1;
  width: 44px;
  height: 44px;
  margin: 0;
  border-radius: 14px;
  cursor: pointer;
  appearance: none;

  &:disabled {
    cursor: not-allowed;
  }
}

.question-card__check {
  position: relative;
  display: grid;
  grid-area: 1 / 1;
  place-items: center;
  place-self: center;
  width: 32px;
  height: 32px;
  border: 2px solid var(--color-text-muted);
  border-radius: 10px;
  background: var(--color-white);
  pointer-events: none;
  transition:
    background-color 0.2s ease,
    border-color 0.2s ease;

  .question-card__correct:hover:not(:disabled) + & {
    border-color: var(--color-green-dark);
    background: rgb(var(--rgb-green) / 0.12);
  }

  .question-card__correct:checked + & {
    border-color: var(--color-green-dark);
    background: var(--color-green-dark);
  }

  .question-card__correct:disabled:not(:checked) + & {
    border-style: dashed;
    background: rgb(var(--rgb-blue) / 0.06);
  }

  svg {
    fill: none;
    stroke-linecap: round;
    stroke-linejoin: round;
  }
}

.question-card__check-mark {
  width: 22px;
  height: 22px;
  stroke: var(--color-white);
  stroke-width: 3;
  opacity: 0;

  .question-card__correct:checked + .question-card__check & {
    opacity: 1;
  }
}

// Замок — знак, что галочку сейчас не изменить: остался последний правильный или последний неправильный вариант
.question-card__lock {
  position: absolute;
  right: -8px;
  bottom: -8px;
  display: none;
  width: 20px;
  height: 20px;
  padding: 3px;
  border: 1.5px solid var(--color-text-muted);
  border-radius: 50%;
  background: var(--color-white);
  stroke: var(--color-text);
  stroke-width: 2.6;

  .question-card__correct:disabled + .question-card__check & {
    display: block;
  }
}

.question-card__option-text {
  @extend %field;

  min-height: 48px;
  padding: 10px 12px;

  .question-card__option:has(.question-card__correct:checked) &:not([aria-invalid='true']) {
    border-color: var(--color-green-dark);
    background: rgb(var(--rgb-green) / 0.06);
  }
}

.question-card__remove-option {
  @extend %soft-button;

  width: 44px;
  padding: 0;
  background: none;
  color: var(--color-text-muted);
  font-size: 26px;
  font-weight: 500;

  @media (hover: hover) {
    &:hover:not(:disabled) {
      background: rgb(var(--rgb-orange) / 0.14);
      color: var(--color-text);
    }
  }

  &:active:not(:disabled) {
    background: rgb(var(--rgb-orange) / 0.24);
  }
}

.question-card__add-option {
  @extend %soft-button;

  align-self: flex-start;
  padding: 0 16px;
  border: 2px dashed rgb(var(--rgb-blue) / 0.6);
  background: none;
  color: var(--color-blue-dark);

  @media (hover: hover) {
    &:hover:not(:disabled) {
      background: rgb(var(--rgb-blue) / 0.08);
    }
  }

  &:active:not(:disabled) {
    background: rgb(var(--rgb-blue) / 0.16);
  }
}

@media (prefers-reduced-motion: reduce) {
  .question-card__summary,
  .question-card__collapse,
  .question-card__remove,
  .question-card__text,
  .question-card__check,
  .question-card__option-text,
  .question-card__remove-option,
  .question-card__add-option {
    transition: none;
  }
}
</style>
