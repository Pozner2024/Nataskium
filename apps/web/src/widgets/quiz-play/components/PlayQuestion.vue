<template>
  <div v-if="store.question" class="play-question">
    <header class="play-question__top">
      <span class="play-question__title">{{ store.title }}</span>
      <div class="play-question__counter">
        <button
          ref="prevButton"
          class="play-question__arrow"
          type="button"
          :aria-label="t('play.prevQuestion')"
          :disabled="!store.canPrev"
          @click="navigate(store.prev, $event)"
        >‹</button>
        <span class="play-question__progress">{{ store.viewing + 1 }} / {{ store.questions.length }}</span>
        <button
          ref="forwardButton"
          class="play-question__arrow"
          type="button"
          :aria-label="t('play.nextQuestion')"
          :disabled="!store.canForward"
          @click="navigate(store.forward, $event)"
        >›</button>
      </div>
    </header>
    <PlayTimerPortal>
      <PlayTimer />
    </PlayTimerPortal>
    <progress
      class="play-question__bar"
      :max="store.questions.length"
      :value="store.viewing + 1"
      :aria-label="t('play.progress', { current: store.viewing + 1, total: store.questions.length })"
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
    <button v-else ref="nextButton" class="play-question__action" type="button" :disabled="store.busy || store.reviewing" @click="store.next()">
      {{ t('play.next') }}
    </button>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, useTemplateRef, watch } from 'vue'
import { useI18n } from '#imports'
import { PlayTimerPortal } from '@/features/play-session'
import { focusInPlace } from '@/shared'
import { usePlayStore } from '../store'
import PlayTimer from './PlayTimer.vue'

const { t } = useI18n()
const store = usePlayStore()
const heading = useTemplateRef<HTMLElement>('heading')
const nextButton = useTemplateRef<HTMLButtonElement>('nextButton')
const prevButton = useTemplateRef<HTMLButtonElement>('prevButton')
const forwardButton = useTemplateRef<HTMLButtonElement>('forwardButton')

const FEEDBACK_KEYS = { correct: 'play.feedbackCorrect', partial: 'play.feedbackPartial', wrong: 'play.feedbackWrong' } as const
const feedbackText = computed(() => (store.feedback === null ? '' : t(FEEDBACK_KEYS[store.feedback])))

// Кнопка, на которой был фокус, исчезает или блокируется: без переноса фокус упал бы на body
async function moveFocus(): Promise<void> {
  await nextTick()
  // Пока идёт запрос, «Дальше» заблокирована, а заблокированной кнопке фокус не дать
  if (store.busy) return
  const target = store.phase === 'feedback' ? nextButton.value : heading.value
  focusInPlace(target)
}

onMounted(moveFocus)
watch(() => [store.current, store.phase, store.busy], moveFocus)

// После нажатия стрелки фокус остаётся на ней; если она стала неактивной — переходит на другую или на текст вопроса
// Нажатая кнопка берётся из события: в Safari и Firefox на macOS клик не ставит на неё фокус
async function navigate(move: () => void, event: Event): Promise<void> {
  const clicked = event.currentTarget
  move()
  await nextTick()
  const target = [clicked, prevButton.value, forwardButton.value].find(
    (element): element is HTMLButtonElement => element instanceof HTMLButtonElement && !element.disabled,
  )
  focusInPlace(target ?? heading.value)
}

const TYPING_SELECTOR = 'input, textarea, select, [contenteditable]'

function onKeydown(event: KeyboardEvent): void {
  if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return
  if (event.ctrlKey || event.metaKey || event.altKey || event.shiftKey) return
  if (event.target instanceof Element && event.target.closest(TYPING_SELECTOR)) return
  if (event.key === 'ArrowLeft') store.prev()
  else store.forward()
}

onMounted(() => document.addEventListener('keydown', onKeydown))
onBeforeUnmount(() => document.removeEventListener('keydown', onKeydown))

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
  const correct = store.viewCorrect
  if (correct === null) return null
  const chosen = store.isSelected(index)
  const right = correct.includes(index)
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
@use '@/assets/styles/mixins' as *;
@use '@/assets/styles/breakpoints.module' as *;

.play-question {
  display: flex;
  flex: 1;
  flex-direction: column;

  // На широком экране короткий вопрос стоит по центру окна, длинный листается (margin не обрезает его сверху)
  @include tablet {
    flex: none;
    margin-block: auto;
  }
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
  color: var(--g-muted);
  font-size: 15px;
  font-weight: 600;
  line-height: 1.3;
  overflow-wrap: anywhere;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;

  @include desktop {
    font-size: 17px;
  }

  :fullscreen & {
    @include desktop {
      font-size: 20px;
    }
  }
}

.play-question__counter {
  display: flex;
  flex: none;
  align-items: center;
  gap: 6px;
}

.play-question__arrow {
  display: grid;
  place-items: center;
  width: 32px;
  height: 32px;
  padding: 0 0 3px;
  border: 0;
  border-radius: 50%;
  background: var(--g-surface);
  box-shadow: inset 0 0 0 1px var(--g-line);
  color: var(--g-text);
  font: inherit;
  font-size: 22px;
  font-weight: 700;
  line-height: 1;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;

  &:focus-visible {
    outline: 3px solid var(--g-focus);
    outline-offset: 2px;
  }

  &:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }
}

.play-question__progress {
  flex: none;
  padding: 4px 10px;
  border-radius: 999px;
  background: var(--g-surface);
  box-shadow: inset 0 0 0 1px var(--g-line);
  color: var(--g-text);
  font-family: var(--font-display);
  font-size: 14px;
  font-weight: 700;
  line-height: 1.3;
  white-space: nowrap;

  :fullscreen & {
    @include desktop {
      font-size: 18px;
    }
  }
}

.play-question__bar {
  display: block;
  width: 100%;
  height: 8px;
  margin: 10px 0 0;
  border: 0;
  border-radius: 999px;
  overflow: hidden;
  background: var(--g-surface);
  box-shadow: inset 0 0 0 1px var(--g-divider);
  color: var(--g-accent);
  appearance: none;

  &::-webkit-progress-bar {
    border-radius: 999px;
    background: var(--g-surface);
  }

  &::-webkit-progress-value {
    border-radius: 999px;
    background: var(--g-accent);
  }

  &::-moz-progress-bar {
    border-radius: 999px;
    background: var(--g-accent);
  }
}

.play-question__text {
  margin: 22px 0 0;
  border-radius: 8px;
  color: var(--g-text);
  font-size: 22px;
  font-weight: 700;
  line-height: 1.3;
  overflow-wrap: anywhere;

  @include tablet {
    font-size: 28px;
  }

  @include desktop {
    font-size: 32px;
  }

  :fullscreen & {
    @include desktop {
      margin-top: 28px;
      font-size: 42px;
    }
  }
}

.play-question__image {
  position: relative;
  height: min(220px, 34vh);
  margin: 14px 0 0;
  border: 1px solid var(--g-divider);
  border-radius: 18px;
  overflow: hidden;
  background: var(--g-surface);
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
  border: 2px dashed var(--g-line);
  border-radius: inherit;
  color: var(--g-muted);
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
  color: var(--g-muted);
  font-size: 15px;
  line-height: 1.4;

  :fullscreen & {
    @include desktop {
      font-size: 19px;
    }
  }
}

.play-question__options {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
  margin: 18px 0 0;
  padding: 0;
  list-style: none;

  @include tablet {
    gap: 14px;
  }

  @include desktop {
    gap: 16px;
  }

  :fullscreen & {
    @include desktop {
      gap: 20px;
      margin-top: 28px;
    }
  }
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
  flex-wrap: wrap;
  align-content: center;
  align-items: center;
  justify-content: center;
  gap: 8px;
  width: 100%;
  min-height: 88px;
  padding: 12px 10px;
  border: 2px solid var(--g-line);
  border-radius: 18px;
  background: var(--g-surface);
  color: var(--g-text);
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
      border-color: var(--g-accent);
      background: var(--g-surface-hover);
    }
  }

  &:active:not(:disabled) {
    transform: scale(0.97);
  }

  &:focus-visible {
    outline: 3px solid var(--g-focus);
    outline-offset: 3px;
  }

  &:disabled {
    cursor: not-allowed;
  }

  @include tablet {
    min-height: 92px;
    padding: 14px 18px;
    font-size: 20px;
  }

  @include desktop {
    min-height: 104px;
    padding: 16px 22px;
    font-size: 23px;
  }

  :fullscreen & {
    @include desktop {
      min-height: 132px;
      padding: 20px 28px;
      border-radius: 24px;
      font-size: 28px;
    }
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
  background: var(--g-surface);
}

.play-question__option--image .play-question__option-text {
  padding: 0 4px 4px;
}

.play-question__option--selected,
.play-question__option--selected:disabled {
  border-color: var(--g-accent);
  background: var(--g-accent-soft);
  box-shadow: inset 0 0 0 2px var(--g-accent);
}

.play-question__option--correct,
.play-question__option--correct:disabled {
  border-color: var(--g-ok);
  background: var(--g-ok-soft);
  box-shadow: inset 0 0 0 2px var(--g-ok);
}

.play-question__option--wrong,
.play-question__option--wrong:disabled {
  border-color: var(--g-bad);
  background: var(--g-bad-soft);
  box-shadow: inset 0 0 0 2px var(--g-bad);
}

.play-question__option--missed,
.play-question__option--missed:disabled {
  padding: 11px 9px;
  border: 3px dashed var(--g-ok);
  background: var(--g-surface);
  box-shadow: none;
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
  font-size: 16px;
  font-weight: 800;
  line-height: 1;

  .play-question__option--correct & {
    background: var(--g-ok);
    color: var(--g-on-ok);
  }

  .play-question__option--wrong & {
    background: var(--g-bad);
    color: var(--g-on-bad);
  }

  // У пропущенного правильного символа в разметке нет: контурная галочка рисуется здесь
  .play-question__option--missed & {
    border: 2px solid var(--g-ok);
    color: var(--g-ok);

    &::before {
      content: '✓';
      content: '✓' / '';
    }
  }

  // На плитке с картинкой отметка лежит поверх картинки, обводка отделяет её от фото
  .play-question__option--image & {
    position: absolute;
    top: 10px;
    inset-inline-end: 10px;
    box-shadow: 0 0 0 2px var(--g-sticky);
  }

  :fullscreen & {
    @include desktop {
      width: 36px;
      height: 36px;
      font-size: 20px;
    }
  }
}

.play-question__action {
  @include play-action;

  margin-top: 24px;

  @include tablet {
    max-width: 360px;
    min-height: 60px;
    margin-inline: auto;
    font-size: 20px;
  }

  @include desktop {
    max-width: 420px;
    min-height: 64px;
    font-size: 22px;
  }

  :fullscreen & {
    @include desktop {
      max-width: 480px;
      min-height: 72px;
      font-size: 24px;
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
