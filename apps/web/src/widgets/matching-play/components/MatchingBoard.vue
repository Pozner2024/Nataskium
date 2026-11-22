<template>
  <div class="matching-board">
    <!-- Задание и подсказки остаются для экранного диктора и фокуса, на экране их нет -->
    <div class="matching-board__intro matching-board__sr-only">
      <h1 ref="heading" class="matching-board__task" tabindex="-1">{{ t('matchingPlay.task') }}</h1>
      <p class="matching-board__hint matching-board__hint--tray">{{ t('matchingPlay.hint') }}</p>
      <p class="matching-board__hint matching-board__hint--column">{{ t('matchingPlay.hintWide') }}</p>
      <p class="matching-board__alt">{{ t('matchingPlay.alt') }}</p>
    </div>

    <EntranceCard
      class="matching-board__card"
      items=".matching-board__tray, .definition-card"
      @entering="store.holdClock()"
      @landed="onLanded"
    >
      <div class="matching-board__layout">
        <div
          ref="tray"
          class="matching-board__tray"
          :class="{ 'matching-board__tray--over': isReturning, 'matching-board__tray--empty': store.pool.length === 0 }"
        >
          <div class="matching-board__tray-head">
            <p v-if="isReturning" class="matching-board__tray-title matching-board__tray-title--return">{{ t('matchingPlay.returnHere') }}</p>
            <p v-else-if="store.isComplete" class="matching-board__done">{{ t('matchingPlay.allPlaced') }}</p>
            <template v-else>
              <p id="matching-tray-title" class="matching-board__tray-title">{{ t('matchingPlay.trayTitle') }}</p>
              <p class="matching-board__tray-count">
                {{ t('matchingPlay.leftToPlace', { count: store.pool.length }) }}<template v-if="canScrollPool"> · {{ t('matchingPlay.scrollHint') }}</template>
              </p>
            </template>
            <PlayTimerPortal>
              <PlayTimer class="matching-board__timer" :mode="store.timer.mode" />
            </PlayTimerPortal>
          </div>

          <!-- Запасной путь без перетаскивания: выбранное в клетке слово возвращается к словам -->
          <button v-if="pickedPlacement !== null" class="matching-board__return" type="button" @click="removeAt(pickedPlacement)">
            {{ t('matchingPlay.removeLabel', { term: termText(store.picked) ?? '' }) }}
          </button>
          <ul v-if="store.pool.length > 0" ref="pool" class="matching-board__pool" aria-labelledby="matching-tray-title">
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

          <button
            ref="trayCheck"
            class="matching-board__check matching-board__check--tray"
            type="button"
            :disabled="!store.canCheck"
            @click="store.check()"
          >
            {{ t('matchingPlay.check') }}
          </button>
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
      </div>
    </EntranceCard>

    <!-- Сколько слов расставлено — внизу по центру, под заданием; название задания и полоса прогресса не показываются -->
    <p class="matching-board__counter" :class="{ 'matching-board__counter--waiting': !landed }">
      <span class="matching-board__progress" aria-hidden="true">{{ store.placedCount }} / {{ total }}</span>
      <span class="matching-board__sr-only">{{ t('matchingPlay.progress', { placed: store.placedCount, total }) }}</span>
    </p>

    <p class="matching-board__sr-only" aria-live="polite">{{ announcement }}</p>

    <!-- Широкий экран: «Проверить» в нижней полосе, как «Отправить ответы» у Wordwall -->
    <div ref="footer" class="matching-board__footer">
      <div class="matching-board__footer-inner">
        <p v-if="store.isComplete" class="matching-board__done">{{ t('matchingPlay.allPlaced') }}</p>
        <p v-else class="matching-board__footer-status">{{ t('matchingPlay.leftToPlace', { count: store.pool.length }) }}</p>
        <button
          ref="footerCheck"
          class="matching-board__check matching-board__check--footer"
          type="button"
          :disabled="!store.canCheck"
          @click="store.check()"
        >
          {{ t('matchingPlay.check') }}
        </button>
      </div>
    </div>

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
import { computed, inject, nextTick, onBeforeUnmount, onMounted, ref, useTemplateRef, watch, type ComponentPublicInstance } from 'vue'
import { useI18n } from '#imports'
import { EntranceCard, PLAYER_SCROLL_KEY, PlayTimer, PlayTimerPortal, usePlayerSound } from '@/features/play-session'
import { focusInPlace } from '@/shared'
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
const trayCheck = useTemplateRef<HTMLButtonElement>('trayCheck')
const footerCheck = useTemplateRef<HTMLButtonElement>('footerCheck')
const footer = useTemplateRef<HTMLElement>('footer')
const scrollContainer = inject(PLAYER_SCROLL_KEY, null)
const cards = ref<(CardInstance | null)[]>([])
const announcement = ref('')
const canScrollPool = ref(false)

const total = computed(() => store.definitions.length)

const drag = useMatchingDrag({
  tray,
  scrollContainer,
  scrollZone,
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

// Выбранное слово уже стоит в клетке: его можно вернуть к словам кнопкой в лотке
const pickedPlacement = computed(() => {
  if (store.picked === null) return null
  const index = store.placements.indexOf(store.picked)
  return index === -1 ? null : index
})

// «Проверить» две: в лотке (телефон) и в нижней полосе (широкий экран); видна одна из них
function focusCheck(): void {
  const visible = [trayCheck.value, footerCheck.value].find((button) => button && button.getClientRects().length > 0)
  ;(visible ?? trayCheck.value)?.focus({ preventScroll: true })
}

// Широкий экран: слова слева, поэтому полоса автопрокрутки — от верха слота до нижней полосы «Проверить».
// Телефон: от низа липкого лотка до низа области прокрутки
function scrollZone(): { top: number; bottom: number } {
  const area = scrollContainer?.value?.getBoundingClientRect() ?? { top: 0, bottom: window.innerHeight }
  const footerRect = footer.value?.getBoundingClientRect()
  if (footerRect && footerRect.height > 0) return { top: area.top, bottom: footerRect.top }
  return { top: tray.value?.getBoundingClientRect().bottom ?? 0, bottom: area.bottom }
}

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
  // Слово встало в клетку — тот же тихий щелчок, что при выборе ответа в других играх
  playSound('select')
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
  return focusCheck
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
    focusCheck()
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

// Вылет (тема интро) не съедает время задания: отсчёт с приземления, фокус на задании после него (ADR 0015)
const landed = ref(false)
const playSound = usePlayerSound()

function onLanded(played: boolean): void {
  landed.value = true
  if (played) store.restartClock()
  focusInPlace(heading.value)
}

onMounted(() => {
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
@use '@/assets/styles/mixins' as *;
@use '@/assets/styles/breakpoints.module' as *;

// Место справа в нижней полосе «Проверить» под кнопки звука и полного экрана проигрывателя

// Высота нижней полосы «Проверить» и поля над колонкой слов: колонка не уходит под полосу
$footer-height: 88px;
$words-top: 16px;
// На большом экране доска не растягивается на всё окно, а стоит по центру
$board-max-width: 1600px;

// Доска заполняет слот по высоте: нижняя полоса стоит у низа окна и при коротком задании
.matching-board {
  // Высота ряда на десктопе растёт с экраном (ноутбук — 52px, интерактивная доска — до 72px); слова и клетки одной высоты
  --matching-row: 52px;

  display: flex;
  flex: 1;
  flex-direction: column;
  color: var(--g-text);

  @include desktop {
    --matching-row: clamp(52px, 5.5vh, 72px);
  }
}

// Рамка темы интро той же ширины, что задание: не шире колонки на широком экране
.matching-board__intro,
.matching-board__card,
.matching-board__layout,
.matching-board__footer-inner {
  @include desktop {
    width: 100%;
    max-width: $board-max-width;
    margin-inline: auto;
  }
}

// Короткое задание стоит по центру свободного места над нижней полосой; длинное листается сверху
.matching-board__card {
  @include tablet {
    margin-top: auto;
  }
}

.matching-board__counter {
  display: flex;
  justify-content: center;
  margin: 20px 0 0;
  transition: opacity 0.3s ease;

  @include tablet {
    margin-bottom: auto;
  }

  // Пока задание вылетает, счётчика не видно: он проявляется вместе с карточкой
  &--waiting {
    visibility: hidden;
    opacity: 0;
  }
}

.matching-board__progress {
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

.matching-board__task {
  margin: 18px 0 0;
  border-radius: 8px;
  font-size: 24px;
  font-weight: 700;
  line-height: 1.25;

  @include tablet {
    margin-top: 10px;
    font-size: 22px;
  }
}

.matching-board__hint {
  margin: 8px 0 0;
  font-size: 17px;
  font-weight: 500;
  line-height: 1.4;

  @include tablet {
    margin-top: 4px;
    font-size: 16px;
  }
}

// Слова на телефоне сверху, на широком экране — слева
.matching-board__hint--tray {
  @include tablet {
    display: none;
  }
}

.matching-board__hint--column {
  display: none;

  @include tablet {
    display: block;
  }
}

// Запасной путь — мелко, не конкурирует с перетаскиванием
.matching-board__alt {
  margin: 4px 0 0;
  color: var(--g-muted);
  font-size: 14px;
  line-height: 1.4;

  @include tablet {
    display: none;
  }
}

.matching-board__sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip-path: inset(50%);
  white-space: nowrap;
}

.matching-board__layout {
  @include tablet {
    --words-width: 150px;

    display: grid;
    grid-template-columns: var(--words-width) minmax(0, 1fr);
    gap: 0 16px;
    align-items: start;
    padding: 12px 0 16px;
    margin-bottom: auto;
  }

  @include desktop {
    --words-width: 280px;

    gap: 0 24px;
  }
}

// Телефон: лоток прилипает к верху области прокрутки, слова на виду, сколько ни листай определения.
// Широкий экран: колонка слов слева, липнет к верху слота и листается сама
.matching-board__tray {
  position: sticky;
  top: var(--play-sticky-top, var(--header-height));
  z-index: var(--z-matching-tray);
  // На всю ширину экрана, а в рамке темы интро (--entrance-bleed: 0) — в пределах карточки
  margin: 16px var(--entrance-bleed, calc(-1 * var(--gutter))) 8px;
  padding: 10px 0 12px;
  border-bottom: 1px solid var(--g-line);
  border-radius: 0 0 22px 22px;
  background: var(--g-sticky);
  box-shadow: 0 10px 24px rgb(0 0 0 / 0.3);

  @include tablet {
    top: $words-top;
    max-height: calc(var(--player-slot-height, 100dvh) - #{$words-top * 2} - #{$footer-height});
    align-self: stretch;
    margin: 0;
    // Отступы и шаг слов как у рядов с клетками (6px сверху и снизу ряда): колонки одной высоты
    padding: 6px 8px;
    overflow-y: auto;
    border-bottom: 0;
    border-radius: 20px;
    background: var(--g-surface);
    box-shadow: inset 0 0 0 1px var(--g-divider);
    scrollbar-width: thin;
  }
}

.matching-board__tray--over {
  border-bottom: 3px solid var(--g-accent);
  background:
    linear-gradient(var(--g-accent-soft), var(--g-accent-soft)),
    var(--g-sticky);

  @include tablet {
    border-bottom: 0;
    box-shadow: inset 0 0 0 3px var(--g-accent);
  }
}

.matching-board__tray-head {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px 10px;
  padding: 0 var(--gutter);

  @include tablet {
    padding: 0 4px;

    &:has(.matching-board__tray-title--return, .matching-board__done) {
      margin-bottom: 10px;
    }
  }
}

// Телефон: «Слова» читает скринридер, на экране — «Осталось расставить: N»
// Заголовок «Слова» только для скринридера: колонка слов и так понятна и встаёт вровень с клетками
.matching-board__tray-title {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip-path: inset(50%);
  white-space: nowrap;

  &--return {
    position: static;
    width: auto;
    height: auto;
    margin: 0;
    overflow: visible;
    clip-path: none;
    white-space: normal;
    color: var(--g-text);
    font-size: 15px;
    font-weight: 700;
    letter-spacing: 0;
    text-transform: none;
  }
}

.matching-board__tray-count {
  min-width: 0;
  margin: 0;
  color: var(--g-text);
  font-size: 15px;
  font-weight: 600;
  line-height: 1.3;

  @include tablet {
    display: none;
  }
}

// Без проигрывателя таймер остаётся в лотке; в проигрывателе он перенесён в его полосу или колонку
.matching-board__tray-head .matching-board__timer {
  flex: none;
  margin: 0 0 0 auto;
}

.matching-board__done {
  display: flex;
  align-items: center;
  gap: 10px;
  margin: 0;
  font-size: 16px;
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
    background: var(--g-ok);
    color: var(--g-on-ok);
    font-size: 16px;
  }

  .matching-board__tray & {
    @include tablet {
      font-size: 15px;
    }
  }
}

.matching-board__return {
  @include play-secondary;

  width: calc(100% - 2 * var(--gutter));
  margin: 10px var(--gutter) 0;
  font-size: 15px;
  text-align: center;

  @include tablet {
    width: 100%;
    margin: 0 0 10px;
    padding: 8px 10px;
  }
}

// Телефон: одна строка, лишнее уходит вправо — видна часть следующей плитки, понятно, что есть ещё
.matching-board__pool {
  display: flex;
  align-items: stretch;
  gap: 10px;
  margin: 8px 0 0;
  padding: 2px var(--gutter) 6px;
  overflow-x: auto;
  list-style: none;
  scroll-padding-inline: var(--gutter);
  scrollbar-width: none;

  @include tablet {
    flex-direction: column;
    gap: 12px;
    margin: 0;
    padding: 0;
    overflow: visible;
  }
}

.matching-board__pool-item {
  display: flex;
  flex: none;
  max-width: 280px;

  @include tablet {
    max-width: none;

    :deep(.term-chip) {
      min-height: var(--matching-row, 52px);
      padding: 8px 10px 8px 6px;
      font-size: 16px;
    }
  }

  @include desktop {
    :deep(.term-chip) {
      font-size: 18px;
    }
  }
}

.matching-board__check {
  @include play-action;
}

.matching-board__check--tray {
  width: calc(100% - 2 * var(--gutter));
  min-height: 48px;
  margin: 10px var(--gutter) 0;

  @include tablet {
    display: none;
  }
}

.matching-board__definitions {
  display: flex;
  flex-direction: column;
  margin: 0;
  padding: 0;
  list-style: none;
}

// Нижняя полоса растягивается на всю ширину окна (под колонку таймера тоже) и липнет к низу слота
.matching-board__footer {
  display: none;

  @include tablet {
    position: sticky;
    // Липнет к самому низу слота, а не над запасом под кнопки проигрывателя
    bottom: calc(-1 * var(--player-controls-clearance, 0px));
    z-index: var(--z-matching-tray);
    display: block;
    // Полоса прижата к низу слота (под ней нет запаса под кнопки), а справа оставлено место кнопкам проигрывателя
    margin: 0 calc(-1 * var(--player-pad-end, 0px)) calc(-1 * var(--player-controls-clearance, 0px))
      calc(-1 * var(--player-pad-start, 0px));
    padding: 14px var(--player-controls-room, 0px) 14px var(--player-pad-start, 0px);
    border-top: 1px solid var(--g-line);
    background: var(--g-sticky);
    box-shadow: 0 -8px 20px rgb(0 0 0 / 0.25);
  }
}

.matching-board__footer-inner {
  display: flex;
  align-items: center;
  gap: 16px;
}

.matching-board__footer-status {
  margin: 0;
  color: var(--g-muted);
  font-size: 16px;
  font-weight: 600;
}

.matching-board__check--footer {
  width: auto;
  min-width: 220px;
  margin-left: auto;
}

.matching-board__lifted {
  position: fixed;
  z-index: var(--z-drag-chip);
  max-width: 280px;
}
</style>
