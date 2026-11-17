<template>
  <div class="matching-board">
    <div class="matching-board__intro">
      <header class="matching-board__top">
        <span class="matching-board__title">{{ store.title }}</span>
        <span class="matching-board__progress">{{ store.placedCount }} / {{ total }}</span>
      </header>
      <progress
        class="matching-board__bar"
        :max="total"
        :value="store.placedCount"
        :aria-label="t('matchingPlay.progress', { placed: store.placedCount, total })"
      />
      <h1 ref="heading" class="matching-board__task" tabindex="-1">{{ t('matchingPlay.task') }}</h1>
      <p class="matching-board__hint">{{ t('matchingPlay.hint') }}</p>
      <p class="matching-board__alt">{{ t('matchingPlay.alt') }}</p>
    </div>

    <p class="matching-board__sr-only" aria-live="polite">{{ announcement }}</p>

    <div ref="tray" class="matching-board__tray" :class="{ 'matching-board__tray--over': isReturning }">
      <div class="matching-board__tray-head">
        <p v-if="isReturning" class="matching-board__tray-title">{{ t('matchingPlay.returnHere') }}</p>
        <template v-else-if="store.isComplete">
          <p class="matching-board__done">{{ t('matchingPlay.allPlaced') }}</p>
        </template>
        <template v-else>
          <p id="matching-tray-title" class="matching-board__tray-title">{{ t('matchingPlay.trayTitle') }}</p>
          <p class="matching-board__tray-count">
            {{ t('matchingPlay.left', store.pool.length) }}<template v-if="canScrollPool"> · {{ t('matchingPlay.scrollHint') }}</template>
          </p>
        </template>
        <PlayTimer class="matching-board__timer" :mode="store.timer.mode" />
      </div>

      <template v-if="store.isComplete && !isReturning">
        <button ref="checkButton" class="matching-board__check" type="button" :disabled="!store.canCheck" @click="store.check()">
          {{ t('matchingPlay.check') }}
        </button>
        <p class="matching-board__done-hint">{{ t('matchingPlay.changeHint') }}</p>
      </template>
      <ul v-else-if="!store.isComplete" ref="pool" class="matching-board__pool" aria-labelledby="matching-tray-title">
        <li v-for="term in store.pool" :key="term" class="matching-board__pool-item">
          <TermChip
            :text="store.terms[term] ?? ''"
            :picked="store.picked === term"
            :ghost="drag.dragged.value?.term === term"
            :disabled="store.isLocked"
            @pointerdown="drag.startPress($event, { term, from: null })"
            @click="tapTerm(term)"
          />
        </li>
      </ul>
    </div>

    <ol class="matching-board__definitions" :aria-label="t('matchingPlay.definitionsLabel')">
      <DefinitionCard
        v-for="(text, index) in store.definitions"
        :key="index"
        :ref="(card) => setCard(index, card)"
        :number="index + 1"
        :text="text"
        :placed="termText(store.placements[index] ?? null)"
        :picked="termText(store.picked)"
        :placed-picked="store.picked !== null && store.placements[index] === store.picked"
        :armed="drag.dragged.value !== null"
        :over="isOver(index)"
        :over-term="drag.dragged.value ? termText(drag.dragged.value.term) : null"
        :ghost="drag.dragged.value?.from === index"
        :disabled="store.isLocked"
        @place="tapDefinition(index)"
        @chip-press="pressPlaced($event, index)"
        @chip-click="tapPlaced(index)"
        @remove="removeAt(index)"
      />
    </ol>

    <TermChip
      v-if="drag.dragged.value"
      class="matching-board__lifted"
      :style="liftedStyle"
      :text="termText(drag.dragged.value.term) ?? ''"
      lifted
    />
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, useTemplateRef, watch, type ComponentPublicInstance } from 'vue'
import { useI18n } from '#imports'
import { PlayTimer } from '@/features/play-session'
import { useMatchingPlayStore } from '../store'
import type { DropTarget, PlaceOutcome } from '../types'
import { useMatchingDrag, type DragSource } from '../useMatchingDrag'
import DefinitionCard from './DefinitionCard.vue'
import TermChip from './TermChip.vue'

type CardInstance = InstanceType<typeof DefinitionCard>

const { t } = useI18n()
const store = useMatchingPlayStore()
const heading = useTemplateRef<HTMLElement>('heading')
const tray = useTemplateRef<HTMLElement>('tray')
const pool = useTemplateRef<HTMLElement>('pool')
const checkButton = useTemplateRef<HTMLButtonElement>('checkButton')
const cards = ref<(CardInstance | null)[]>([])
const announcement = ref('')
const canScrollPool = ref(false)

const total = computed(() => store.definitions.length)

const drag = useMatchingDrag({
  tray,
  definitions: () => store.definitions.map((_, index) => cards.value[index]?.root ?? null),
  isLocked: computed(() => store.isLocked),
  onLift: (source) => {
    store.cancelPick()
    announce(t('matchingPlay.announce.lifted', { term: termText(source.term) ?? '' }))
  },
  onDrop: dropTerm,
})

const isReturning = computed(() => (drag.dragged.value?.from ?? null) !== null && drag.over.value?.kind === 'tray')
const liftedStyle = computed(() => {
  const chip = drag.dragged.value
  if (!chip) return {}
  return {
    left: `${drag.pointer.value.x - chip.offset.x}px`,
    top: `${drag.pointer.value.y - chip.offset.y}px`,
    width: `${chip.width}px`,
  }
})

function termText(term: number | null): string | null {
  return term === null ? null : (store.terms[term] ?? null)
}

function setCard(index: number, card: Element | ComponentPublicInstance | null): void {
  cards.value[index] = card as CardInstance | null
}

function isOver(index: number): boolean {
  const target = drag.over.value
  return target?.kind === 'definition' && target.index === index
}

// Одинаковый текст подряд живая область не перечитывает: сначала очищаем
async function announce(text: string): Promise<void> {
  announcement.value = ''
  await nextTick()
  announcement.value = text
}

function announcePlaced(term: number, definition: number, outcome: PlaceOutcome): void {
  const word = termText(term) ?? ''
  if (store.isComplete) {
    void announce(t('matchingPlay.announce.allPlaced'))
    return
  }
  if (outcome.replaced !== null) {
    void announce(t('matchingPlay.announce.replaced', { term: word, number: definition + 1, replaced: termText(outcome.replaced) ?? '' }))
    return
  }
  void announce(t('matchingPlay.announce.placed', { term: word, number: definition + 1, left: store.pool.length }))
}

// Запасной путь: после постановки — следующее пустое определение, после последнего — «Проверить»
function nextFocusTarget(after: number): (() => void) | null {
  const count = store.definitions.length
  for (let step = 1; step <= count; step += 1) {
    const index = (after + step) % count
    if (store.placements[index] === null) return () => cards.value[index]?.focus()
  }
  return () => checkButton.value?.focus({ preventScroll: true })
}

async function placeByTap(term: number, definition: number): Promise<void> {
  const outcome = store.place(term, definition)
  if (outcome === null) return
  announcePlaced(term, definition, outcome)
  const focusNext = nextFocusTarget(definition)
  await nextTick()
  focusNext?.()
}

function tapTerm(term: number): void {
  if (drag.consumeClick()) return
  store.pick(term)
  const word = termText(term) ?? ''
  void announce(store.picked === term ? t('matchingPlay.announce.picked', { term: word }) : t('matchingPlay.announce.cancelled'))
}

function tapDefinition(definition: number): void {
  if (store.picked === null) return
  void placeByTap(store.picked, definition)
}

// Тап по поставленному слову: при выбранном другом — замена, иначе слово выбирается, чтобы перенести его
function tapPlaced(definition: number): void {
  if (drag.consumeClick()) return
  const placed = store.placements[definition] ?? null
  if (placed === null) return
  if (store.picked !== null && store.picked !== placed) {
    void placeByTap(store.picked, definition)
    return
  }
  tapTerm(placed)
}

async function removeAt(definition: number): Promise<void> {
  const term = store.unplace(definition)
  if (term === null) return
  void announce(t('matchingPlay.announce.returned', { term: termText(term) ?? '' }))
  await nextTick()
  cards.value[definition]?.focus()
}

function pressPlaced(event: PointerEvent, definition: number): void {
  const term = store.placements[definition] ?? null
  if (term !== null) drag.startPress(event, { term, from: definition })
}

async function dropTerm(source: DragSource, target: DropTarget | null): Promise<void> {
  if (target?.kind === 'definition') {
    const outcome = store.place(source.term, target.index)
    if (outcome === null) return
    announcePlaced(source.term, target.index, outcome)
    if (!store.isComplete) return
    await nextTick()
    checkButton.value?.focus({ preventScroll: true })
    return
  }
  if (target?.kind === 'tray' && source.from !== null && store.unplace(source.from) !== null) {
    void announce(t('matchingPlay.announce.returned', { term: termText(source.term) ?? '' }))
  }
}

function onKeydown(event: KeyboardEvent): void {
  if (event.key !== 'Escape' || store.picked === null || drag.dragged.value !== null) return
  store.cancelPick()
  void announce(t('matchingPlay.announce.cancelled'))
}

function measurePool(): void {
  const element = pool.value
  canScrollPool.value = element !== null && element.scrollWidth > element.clientWidth
}

watch(
  () => store.pool.length,
  async () => {
    await nextTick()
    measurePool()
  },
)

onMounted(() => {
  heading.value?.focus()
  measurePool()
  document.addEventListener('keydown', onKeydown)
  window.addEventListener('resize', measurePool)
})

onBeforeUnmount(() => {
  document.removeEventListener('keydown', onKeydown)
  window.removeEventListener('resize', measurePool)
})
</script>

<style scoped lang="scss">
.matching-board {
  display: flex;
  flex-direction: column;
}

.matching-board__top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.matching-board__title {
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

.matching-board__progress {
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

.matching-board__bar {
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

.matching-board__task {
  margin: 18px 0 0;
  border-radius: 8px;
  font-size: 24px;
  font-weight: 700;
  line-height: 1.25;
}

.matching-board__hint {
  margin: 8px 0 0;
  font-size: 17px;
  font-weight: 500;
  line-height: 1.4;
}

// Запасной путь — мелко и серым, не конкурирует с перетаскиванием
.matching-board__alt {
  margin: 4px 0 0;
  color: var(--color-text-muted);
  font-size: 14px;
  line-height: 1.4;
}

.matching-board__sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip-path: inset(50%);
  white-space: nowrap;
}

// Лоток прилипает под шапкой сайта: слова и таймер на виду, сколько ни прокручивай определения
.matching-board__tray {
  position: sticky;
  top: var(--header-height);
  z-index: var(--z-matching-tray);
  margin: 16px calc(-1 * var(--gutter)) 16px;
  padding: 10px 0 12px;
  border-bottom: 1px solid rgb(var(--rgb-blue) / 0.18);
  border-radius: 0 0 24px 24px;
  background: var(--color-white);
  box-shadow: 0 10px 24px rgb(var(--rgb-night) / 0.12);
}

.matching-board__tray--over {
  border-bottom: 3px solid var(--color-blue-dark);
  background: #eef3ff;
}

.matching-board__tray-head {
  display: flex;
  align-items: center;
  gap: 10px;
  min-height: 36px;
  padding: 0 var(--gutter);
}

.matching-board__tray-title {
  margin: 0;
  color: var(--color-text-muted);
  font-size: 15px;
  font-weight: 700;
  letter-spacing: 0.05em;
  text-transform: uppercase;

  .matching-board__tray--over & {
    color: var(--color-blue-dark);
    letter-spacing: 0;
    text-transform: none;
  }
}

.matching-board__tray-count {
  min-width: 0;
  margin: 0;
  color: var(--color-text-muted);
  font-size: 15px;
  font-weight: 600;
  line-height: 1.3;
}

.matching-board__timer {
  flex: none;
  margin: 0 0 0 auto;
  padding: 4px 12px 4px 8px;

  :deep(.play-timer__time) {
    font-size: 15px;
  }

  // «Осталось мало» в лотке не помещается: остаются треугольник и цвет, скринридер слышит объявление таймера
  :deep(.play-timer__low) {
    display: none;
  }
}

.matching-board__done {
  display: flex;
  align-items: center;
  gap: 10px;
  margin: 0;
  font-size: 18px;
  font-weight: 700;

  &::before {
    content: '✓';
    content: '✓' / '';
    display: grid;
    flex: none;
    place-items: center;
    width: 28px;
    height: 28px;
    border-radius: 50%;
    background: var(--color-green-dark);
    color: var(--color-white);
    font-size: 16px;
  }
}

// Одна строка, лишнее уходит вправо: видна часть следующей плитки — понятно, что есть ещё
.matching-board__pool {
  display: flex;
  align-items: stretch;
  gap: 10px;
  margin: 10px 0 0;
  padding: 2px var(--gutter) 6px;
  overflow-x: auto;
  list-style: none;
  scroll-padding-inline: var(--gutter);
  scrollbar-width: none;
}

.matching-board__pool-item {
  display: flex;
  flex: none;
  max-width: 280px;
}

.matching-board__check {
  display: flex;
  align-items: center;
  justify-content: center;
  width: calc(100% - 2 * var(--gutter));
  min-height: 60px;
  margin: 10px var(--gutter) 0;
  padding: 8px 20px;
  border: 0;
  border-radius: 999px;
  background: var(--color-orange);
  box-shadow: 0 10px 24px rgb(var(--rgb-orange) / 0.4);
  color: var(--color-white);
  font: inherit;
  font-size: 20px;
  font-weight: 700;
  line-height: 1.25;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
  transition:
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

  &:focus-visible {
    outline: 3px solid var(--focus-color);
    outline-offset: 3px;
  }

  &:disabled {
    cursor: progress;
    opacity: 0.7;
    box-shadow: none;
  }
}

.matching-board__done-hint {
  margin: 8px var(--gutter) 0;
  color: var(--color-text-muted);
  font-size: 14px;
  line-height: 1.4;
  text-align: center;
}

.matching-board__definitions {
  display: flex;
  flex-direction: column;
  gap: 14px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.matching-board__lifted {
  position: fixed;
  z-index: var(--z-drag-chip);
  max-width: 280px;
}

@media (prefers-reduced-motion: reduce) {
  .matching-board__check {
    transition: none;

    &:active:not(:disabled) {
      transform: none;
    }
  }
}
</style>
