<template>
  <section class="true-false-play">
    <p class="true-false-play__sr-only" role="status">{{ timer.announcement.value }}</p>

    <p v-if="store.status === 'loading'" class="true-false-play__loading" role="status">{{ t('play.loading') }}</p>

    <div v-else-if="store.status === 'notFound'" class="true-false-play__status">
      <p class="true-false-play__message" role="alert">{{ t('play.notFound') }}</p>
    </div>

    <div v-else-if="store.status === 'changed'" class="true-false-play__status">
      <p class="true-false-play__message" role="alert">{{ t('play.changed') }}</p>
      <button class="true-false-play__button" type="button" @click="store.start()">{{ t('play.restart') }}</button>
    </div>

    <div v-else-if="store.status === 'failed'" class="true-false-play__status">
      <p class="true-false-play__message" role="alert">{{ t('play.failed') }}</p>
      <button class="true-false-play__button" type="button" @click="store.retry()">{{ t('play.retry') }}</button>
    </div>

    <TrueFalseResult v-else-if="store.phase === 'result'" />

    <div v-else-if="store.statement !== null" class="true-false-play__screen">
      <PlayTimerPortal>
        <PlayTimer :mode="store.timer.mode" />
      </PlayTimerPortal>

      <EntranceCard
        :swap-key="store.viewing"
        items=".statement-card, .true-false-play__hint, .answer-buttons__button"
        @entering="store.holdClock()"
        @landed="onLanded"
      >
        <StatementCard ref="card" :text="store.statement" />
        <p class="true-false-play__hint">{{ t('play.trueFalse.question') }}</p>

        <p class="true-false-play__live" aria-live="polite">{{ verdictText }}</p>

        <AnswerButtons
          :chosen="store.answers[store.viewing] ?? null"
          :disabled="!store.canAnswer"
          :verdict="store.verdict"
          @answer="onAnswer"
        />
      </EntranceCard>

      <!-- Навигация по утверждениям — внизу по центру, под ответами; название задания и полоса прогресса не показываются -->
      <div class="true-false-play__counter" :class="{ 'true-false-play__counter--waiting': !landed }">
        <button ref="prevArrow" class="true-false-play__arrow" type="button" :aria-label="t('play.trueFalse.prevStatement')" :disabled="!store.canPrev" @click="onArrow(store.prev, $event)">‹</button>
        <span class="true-false-play__progress" aria-hidden="true">{{ store.viewing + 1 }} / {{ store.statements.length }}</span>
        <span class="true-false-play__sr-only">{{ t('play.trueFalse.progress', { current: store.viewing + 1, total: store.statements.length }) }}</span>
        <button ref="nextArrow" class="true-false-play__arrow" type="button" :aria-label="t('play.trueFalse.nextStatement')" :disabled="!store.canForward" @click="onArrow(store.forward, $event)">›</button>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, provide, ref, useTemplateRef, watch } from 'vue'
import { useI18n, useSeoMeta } from '#imports'
import type { PlayTrueFalseResponse } from '@/entities/true-false'
import { EntranceCard, PlayTimer, PlayTimerPortal, PLAY_TIMER_KEY, usePlayerPause, usePlayerScrollRelease, usePlayerSound } from '@/features/play-session'
import type { PlaySource } from '@/shared'
import AnswerButtons from './components/AnswerButtons.vue'
import StatementCard from './components/StatementCard.vue'
import TrueFalseResult from './components/TrueFalseResult.vue'
import { useTrueFalsePlayStore } from './store'
import { useTrueFalsePlayTimer } from './useTrueFalsePlayTimer'

// initial — ответ GET, уже полученный PlayPage; без него виджет загружает задание сам
const props = defineProps<{ source: PlaySource; initial?: PlayTrueFalseResponse }>()

const { t } = useI18n()
const store = useTrueFalsePlayStore()
usePlayerPause(store.pauseClock, store.resumeClock)
const card = useTemplateRef<{ focus: () => void }>('card')
const prevArrow = useTemplateRef<HTMLButtonElement>('prevArrow')
const nextArrow = useTemplateRef<HTMLButtonElement>('nextArrow')
// Пока первое утверждение вылетает, фокус не трогаем: он переходит на утверждение после приземления
const landed = ref(false)

const timer = useTrueFalsePlayTimer()
provide(PLAY_TIMER_KEY, timer)
usePlayerScrollRelease(() => store.status !== 'ready' || store.phase === 'result')

useSeoMeta({ title: () => store.title, robots: 'noindex, nofollow' })

const playSound = usePlayerSound()

function onAnswer(value: boolean): void {
  playSound('select')
  store.answer(value)
}

// Если учитель показывает ответы: звон за верное, мягкий звук за неверное — только для текущего утверждения
watch(
  () => store.verdict,
  (verdict) => {
    if (verdict === null || store.viewing !== store.current) return
    playSound(verdict ? 'correct' : 'wrong')
  },
)

// Слова слышит только скринридер и только про текущий ответ; при просмотре прошлых утверждений молчим
const verdictText = computed(() => {
  if (store.verdict === null || store.viewing !== store.current) return ''
  return t(store.verdict ? 'play.trueFalse.verdictCorrect' : 'play.trueFalse.verdictWrong')
})

// Кнопка, на которой был фокус, блокируется: без переноса фокус упал бы на body
async function moveFocus(): Promise<void> {
  await nextTick()
  if (!landed.value || store.busy || store.status !== 'ready' || store.phase === 'result') return
  card.value?.focus()
}

// Фокус остаётся на стрелке, которой листают; погасшая стрелка передаёт его соседней, а если обе погасли — заголовку
async function keepArrowFocus(used: HTMLElement | null): Promise<void> {
  await nextTick()
  const arrows = [prevArrow.value, nextArrow.value]
  const active = used ?? arrows.find((arrow) => arrow === document.activeElement)
  if (!(active instanceof HTMLButtonElement)) return
  if (!active.disabled) {
    if (document.activeElement !== active) active.focus()
    return
  }
  const other = arrows.find((arrow) => arrow !== active && arrow?.disabled === false)
  if (other) other.focus()
  else card.value?.focus()
}

// Вылет (тема интро) не съедает время задания: отсчёт с приземления утверждения (ADR 0015)
function onLanded(played: boolean): void {
  landed.value = true
  if (played) store.restartClock()
  void moveFocus()
}

function onArrow(navigate: () => void, event: Event): void {
  navigate()
  void keepArrowFocus(event.currentTarget instanceof HTMLElement ? event.currentTarget : null)
}

const TYPING_SELECTOR = 'input, textarea, select, [contenteditable]'

function onKeydown(event: KeyboardEvent): void {
  if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return
  if (event.ctrlKey || event.metaKey || event.altKey || event.shiftKey) return
  if (event.target instanceof Element && event.target.closest(TYPING_SELECTOR)) return
  if (event.key === 'ArrowLeft') store.prev()
  else store.forward()
  void keepArrowFocus(null)
}

onMounted(() => {
  document.addEventListener('keydown', onKeydown)
  store.start(props.source, props.initial)
})
onBeforeUnmount(() => {
  document.removeEventListener('keydown', onKeydown)
  store.dispose()
})
watch(() => [store.current, store.phase, store.busy, store.advancing, store.status], moveFocus)
</script>

<style scoped lang="scss">
@use '@/assets/styles/mixins' as *;
@use '@/assets/styles/breakpoints.module' as *;

// Колонка игры на фоне проигрывателя
.true-false-play {
  display: flex;
  flex-direction: column;
  width: 100%;
  max-width: 560px;
  min-height: 100%;
  margin: 0 auto;
  padding: 8px var(--gutter) 24px;
  color: var(--g-text);

  // Ширины как у викторины
  @include tablet {
    max-width: 760px;
    padding: 16px 0 24px;
  }

  @include desktop {
    max-width: 1000px;
  }

  :fullscreen & {
    @include desktop {
      max-width: 1180px;
    }
  }
}

.true-false-play__sr-only,
.true-false-play__live {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip-path: inset(50%);
  white-space: nowrap;
}

.true-false-play__loading {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 14px;
  margin: 48px 0 0;
  color: var(--g-muted);
  font-weight: 500;

  &::before {
    content: '';
    width: 36px;
    height: 36px;
    border: 4px solid var(--g-surface);
    border-top-color: var(--g-accent);
    border-radius: 50%;
    animation: true-false-play-spin 0.9s linear infinite;
  }

  @media (prefers-reduced-motion: reduce) {
    &::before {
      animation: none;
    }
  }
}

@keyframes true-false-play-spin {
  to {
    transform: rotate(1turn);
  }
}

.true-false-play__status {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 20px;
  margin-top: 32px;
  padding: 28px 20px 24px;
  text-align: center;
}

.true-false-play__message {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 14px;
  margin: 0;
  font-size: 18px;
  font-weight: 600;
  line-height: 1.4;
  overflow-wrap: anywhere;

  &::before {
    content: '!';
    content: '!' / '';
    display: grid;
    place-items: center;
    width: 44px;
    height: 44px;
    border-radius: 50%;
    background: var(--color-orange-dark);
    color: var(--color-white);
    font-family: var(--font-display);
    font-size: 22px;
    font-weight: 700;
    line-height: 1;
  }
}

.true-false-play__button {
  @include play-secondary;
}

.true-false-play__screen {
  display: flex;
  flex: 1;
  flex-direction: column;

  // Короткое утверждение стоит по центру окна, длинное листается (margin не обрезает его сверху)
  @include tablet {
    flex: none;
    margin-block: auto;
  }
}

.true-false-play__counter {
  display: flex;
  flex: none;
  align-items: center;
  justify-content: center;
  gap: 6px;
  margin-top: 20px;
  transition: opacity 0.3s ease;

  &--waiting {
    visibility: hidden;
    opacity: 0;
  }
}

.true-false-play__arrow {
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

.true-false-play__progress {
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
}

.true-false-play__hint {
  margin: 10px 0 0;
  color: var(--g-muted);
  font-size: 15px;
  line-height: 1.4;
  text-align: center;

  :fullscreen & {
    @include desktop {
      font-size: 19px;
    }
  }
}
</style>
