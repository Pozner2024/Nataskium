<template>
  <div v-if="store.question" class="play-question">
    <header class="play-question__top">
      <span class="play-question__title">{{ store.title }}</span>
      <span class="play-question__progress">{{ store.current + 1 }} / {{ store.questions.length }}</span>
    </header>
    <PlayTimer />
    <progress
      class="play-question__bar"
      :max="store.questions.length"
      :value="store.current + 1"
      :aria-label="t('play.progress', { current: store.current + 1, total: store.questions.length })"
    />

    <h1 ref="heading" class="play-question__text" tabindex="-1">{{ store.question.text }}</h1>
    <div v-if="store.question.imageUrl" class="play-question__image">
      <p v-if="isBroken(store.question.imageUrl)" class="play-question__image-fallback">{{ t('play.imageFailed') }}</p>
      <img
        v-else
        class="play-question__image-img"
        :src="store.question.imageUrl"
        alt=""
        @error="markBroken(store.question.imageUrl)"
      >
    </div>
    <p class="play-question__hint">{{ t('play.selectHint', store.question.selectCount) }}</p>

    <p class="play-question__sr-only" aria-live="polite">{{ feedbackText }}</p>

    <ul class="play-question__options">
      <li v-for="(option, position) in store.question.options" :key="option.index" class="play-question__item">
        <button
          class="play-question__option"
          :class="[optionClass(option.index), { 'play-question__option--image': option.imageUrl }]"
          type="button"
          :aria-pressed="store.isSelected(option.index)"
          :disabled="store.isDisabled(option.index)"
          :aria-label="imageOptionLabel(option, position)"
          @click="store.toggle(option.index)"
        >
          <span v-if="option.imageUrl" class="play-question__option-image">
            <span v-if="isBroken(option.imageUrl)" class="play-question__option-fallback" aria-hidden="true">
              {{ t('play.imageFailed') }}
            </span>
            <img v-else class="play-question__option-img" :src="option.imageUrl" alt="" @error="markBroken(option.imageUrl)">
          </span>
          <span v-if="option.text" class="play-question__option-text">{{ option.text }}</span>
          <template v-if="mark(option.index)">
            <span class="play-question__mark" aria-hidden="true">{{ mark(option.index)!.symbol }}</span>
            <span class="play-question__sr-only">{{ t(mark(option.index)!.label) }}</span>
          </template>
        </button>
      </li>
    </ul>

    <button
      v-if="store.phase === 'question'"
      class="play-question__action"
      type="button"
      :disabled="!store.canSubmit"
      @click="store.submit()"
    >
      {{ t('play.submit') }}
    </button>
    <button v-else ref="nextButton" class="play-question__action" type="button" :disabled="store.busy" @click="store.next()">
      {{ t('play.next') }}
    </button>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, ref, useTemplateRef, watch } from 'vue'
import { useI18n } from '#imports'
import { usePlayStore } from '../store'
import PlayTimer from './PlayTimer.vue'

const { t } = useI18n()
const store = usePlayStore()
const heading = useTemplateRef<HTMLElement>('heading')
const nextButton = useTemplateRef<HTMLButtonElement>('nextButton')

const FEEDBACK_KEYS = { correct: 'play.feedbackCorrect', partial: 'play.feedbackPartial', wrong: 'play.feedbackWrong' } as const
const feedbackText = computed(() => (store.feedback === null ? '' : t(FEEDBACK_KEYS[store.feedback])))

// Кнопка, на которой был фокус, исчезает или блокируется: без переноса фокус упал бы на body
async function moveFocus(): Promise<void> {
  await nextTick()
  // Пока идёт запрос, «Дальше» заблокирована, а заблокированной кнопке фокус не дать
  if (store.busy) return
  const target = store.phase === 'feedback' ? nextButton.value : heading.value
  target?.focus()
}

onMounted(moveFocus)
watch(() => [store.current, store.phase, store.busy], moveFocus)

// Адреса картинок, которые не открылись: вместо них заглушка, вариант остаётся выбираемым
const brokenImages = ref(new Set<string>())

function isBroken(url: string): boolean {
  return brokenImages.value.has(url)
}

function markBroken(url: string): void {
  brokenImages.value.add(url)
}

// Описаний картинок нет: вариант без текста называется по месту на экране.
// aria-label заменяет содержимое кнопки, поэтому отметка после проверки добавляется в него же
function imageOptionLabel(option: { text: string; index: number }, position: number): string | undefined {
  if (option.text !== '') return undefined
  const name = t('play.imageOption', { n: position + 1 })
  const current = mark(option.index)
  return current === null ? name : `${name}, ${t(current.label)}`
}

type Mark = { modifier: 'correct' | 'wrong' | 'missed'; symbol: string; label: string }

// Подсветка только после check (phase === 'feedback'); без showAnswers store её не получает
function mark(index: number): Mark | null {
  if (store.phase !== 'feedback') return null
  const chosen = store.isSelected(index)
  const right = store.correct.includes(index)
  if (chosen && right) return { modifier: 'correct', symbol: '✓', label: 'play.optionCorrect' }
  if (chosen) return { modifier: 'wrong', symbol: '✗', label: 'play.optionWrong' }
  if (right) return { modifier: 'missed', symbol: '', label: 'play.optionMissed' }
  return null
}

function optionClass(index: number): Record<string, boolean> {
  const current = mark(index)
  return {
    'play-question__option--selected': store.isSelected(index),
    'play-question__option--correct': current?.modifier === 'correct',
    'play-question__option--wrong': current?.modifier === 'wrong',
    'play-question__option--missed': current?.modifier === 'missed',
  }
}
</script>

<style scoped lang="scss">
// Красного в палитре бренда нет; он нужен только для неверного ответа, поэтому живёт здесь
.play-question {
  --color-wrong: #c73a3a;
  --rgb-wrong: 199 58 58;

  display: flex;
  flex: 1;
  flex-direction: column;
}

.play-question__top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.play-question__title {
  display: -webkit-box;
  min-width: 0;
  overflow: hidden;
  color: var(--color-text-muted);
  font-size: 15px;
  font-weight: 600;
  line-height: 1.3;
  overflow-wrap: anywhere;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
}

.play-question__progress {
  flex: none;
  padding: 4px 10px;
  border-radius: 999px;
  background: rgb(var(--rgb-blue) / 0.12);
  color: var(--color-blue-dark);
  font-family: var(--font-display);
  font-size: 14px;
  font-weight: 700;
  line-height: 1.3;
  white-space: nowrap;
}

.play-question__bar {
  display: block;
  width: 100%;
  height: 8px;
  margin: 10px 0 0;
  border: 0;
  border-radius: 999px;
  overflow: hidden;
  background: rgb(var(--rgb-blue) / 0.14);
  color: var(--color-blue);
  appearance: none;

  &::-webkit-progress-bar {
    border-radius: 999px;
    background: rgb(var(--rgb-blue) / 0.14);
  }

  &::-webkit-progress-value {
    border-radius: 999px;
    background: var(--color-blue);
  }

  &::-moz-progress-bar {
    border-radius: 999px;
    background: var(--color-blue);
  }
}

.play-question__text {
  margin: 22px 0 0;
  border-radius: 8px;
  font-size: 22px;
  font-weight: 700;
  line-height: 1.3;
  overflow-wrap: anywhere;
}

.play-question__image {
  position: relative;
  height: min(220px, 34vh);
  margin: 14px 0 0;
  border: 1px solid rgb(var(--rgb-blue) / 0.16);
  border-radius: 18px;
  overflow: hidden;
  background: rgb(var(--rgb-blue) / 0.06);
}

.play-question__image-img,
.play-question__option-img {
  position: absolute;
  inset: 0;
  display: block;
  width: 100%;
  height: 100%;
  object-fit: contain;
}

.play-question__image-fallback,
.play-question__option-fallback {
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
  width: 100%;
  height: 100%;
  margin: 0;
  padding: 10px;
  border: 2px dashed rgb(var(--rgb-blue) / 0.3);
  border-radius: inherit;
  color: var(--color-text-muted);
  font-size: 15px;
  font-weight: 500;
  line-height: 1.35;
  text-align: center;
}

.play-question__option-fallback {
  font-size: 13px;
}

.play-question__hint {
  margin: 6px 0 0;
  color: var(--color-text-muted);
  font-size: 15px;
  line-height: 1.4;
}

.play-question__options {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
  margin: 18px 0 0;
  padding: 0;
  list-style: none;
}

.play-question__item {
  display: flex;
  &:last-child:nth-child(odd) {
    grid-column: 1 / -1;
  }
}

.play-question__option {
  position: relative;
  display: flex;
  align-items: center;
  align-content: center;
  justify-content: center;
  flex-wrap: wrap;
  gap: 8px;
  width: 100%;
  min-height: 88px;
  padding: 12px 10px;
  border: 2px solid rgb(var(--rgb-blue) / 0.22);
  border-radius: 18px;
  background: var(--color-white);
  box-shadow: 0 4px 12px rgb(var(--rgb-night) / 0.06);
  color: var(--color-text);
  font: inherit;
  font-size: 16px;
  font-weight: 600;
  line-height: 1.3;
  text-align: center;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
  transition:
    background-color 0.2s ease,
    border-color 0.2s ease,
    box-shadow 0.2s ease,
    transform 0.2s ease;

  @media (hover: hover) {
    &:hover:not(:disabled, .play-question__option--selected) {
      border-color: var(--color-blue);
    }
  }

  &:active:not(:disabled) {
    transform: scale(0.97);
  }
  &:disabled {
    border-color: rgb(var(--rgb-night) / 0.08);
    background: #f4f5f9;
    box-shadow: none;
    color: var(--color-text-muted);
    cursor: not-allowed;
  }

  @media (prefers-reduced-motion: reduce) {
    transition: none;

    &:active:not(:disabled) {
      transform: none;
    }
  }
}

.play-question__option-text {
  min-width: 0;
  overflow-wrap: anywhere;
}

.play-question__option--image {
  flex-direction: column;
  flex-wrap: nowrap;
  align-items: stretch;
  justify-content: flex-start;
  gap: 6px;
  padding: 6px;
}

.play-question__option-image {
  position: relative;
  display: block;
  flex: none;
  width: 100%;
  max-height: 160px;
  aspect-ratio: 1;
  border-radius: 12px;
  overflow: hidden;
  background: rgb(var(--rgb-blue) / 0.06);
}

.play-question__option--image .play-question__option-text {
  padding: 0 4px 4px;
}

.play-question__option--selected,
.play-question__option--selected:disabled {
  border-color: var(--color-blue-dark);
  background: rgb(var(--rgb-blue) / 0.1);
  box-shadow: inset 0 0 0 2px var(--color-blue-dark);
  color: var(--color-blue-dark);
}

.play-question__option--correct,
.play-question__option--correct:disabled {
  border-color: var(--color-green-dark);
  background: rgb(var(--rgb-green) / 0.14);
  box-shadow: inset 0 0 0 2px var(--color-green-dark);
  color: var(--color-text);
}

.play-question__option--wrong,
.play-question__option--wrong:disabled {
  border-color: var(--color-wrong);
  background: rgb(var(--rgb-wrong) / 0.1);
  box-shadow: inset 0 0 0 2px var(--color-wrong);
  color: var(--color-text);
}

.play-question__option--missed,
.play-question__option--missed:disabled {
  border: 3px dashed var(--color-green-dark);
  padding: 11px 9px;
  background: var(--color-white);
  box-shadow: none;
  color: var(--color-text);
}

.play-question__option--image.play-question__option--missed {
  padding: 5px;
}

.play-question__mark {
  display: grid;
  flex: none;
  place-items: center;
  width: 28px;
  height: 28px;
  border-radius: 50%;
  color: var(--color-white);
  font-size: 16px;
  font-weight: 800;
  line-height: 1;

  .play-question__option--correct & {
    background: var(--color-green-dark);
  }

  .play-question__option--wrong & {
    background: var(--color-wrong);
  }

  // У пропущенного правильного символа в разметке нет: контурная галочка рисуется здесь
  .play-question__option--missed & {
    border: 2px solid var(--color-green-dark);
    background: var(--color-white);
    color: var(--color-green-dark);

    &::before {
      content: '✓';
      content: '✓' / '';
    }
  }

  // На плитке с картинкой отметка лежит поверх картинки, белая обводка отделяет её от фото
  .play-question__option--image & {
    position: absolute;
    top: 10px;
    inset-inline-end: 10px;
    box-shadow: 0 0 0 2px var(--color-white);
  }
}

.play-question__action {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  min-height: 56px;
  margin-top: 24px;
  padding: 8px 20px;
  border: 0;
  border-radius: 999px;
  background: var(--color-orange);
  box-shadow: 0 10px 24px rgb(var(--rgb-orange) / 0.4);
  color: var(--color-white);
  font: inherit;
  font-size: 18px;
  font-weight: 700;
  line-height: 1.25;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
  transition:
    background-color 0.2s ease,
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
    cursor: not-allowed;
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

.play-question__sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip-path: inset(50%);
  white-space: nowrap;
}
</style>
