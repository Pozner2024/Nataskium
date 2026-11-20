<template>
  <li
    ref="root"
    class="definition-card"
    :class="{
      'definition-card--armed': armed,
      'definition-card--target': picked !== null && !armed,
      'definition-card--over': over,
      'definition-card--filled': placed !== null && !ghost,
    }"
  >
    <p class="definition-card__text">
      <span class="definition-card__sr-only">{{ t('matchingPlay.definitionNumber', { number }) }}</span>{{ text }}
    </p>

    <div v-if="placed !== null && !ghost" class="definition-card__cell">
      <span v-if="over && overTerm" class="definition-card__replace">
        {{ t('matchingPlay.replaceTitle') }}<br>{{ t('matchingPlay.replaceHint', { term: placed }) }}
      </span>
      <TermChip
        v-else
        ref="chip"
        :text="placed"
        placed
        :picked="placedPicked"
        :disabled="disabled"
        :aria-label="placedLabel"
        @pointerdown="emit('chipPress', $event)"
        @click="emit('chipClick')"
        @keydown.delete.prevent="emit('remove')"
      />
    </div>

    <button
      v-else
      ref="drop"
      class="definition-card__cell definition-card__drop"
      type="button"
      :disabled="disabled"
      :aria-label="picked ? t('matchingPlay.placeLabel', { number, text, term: picked }) : t('matchingPlay.emptyLabel', { number, text })"
      @click="emit('place')"
    >
      <svg v-if="!over" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v11M7.5 9.5 12 14l4.5-4.5M4 15v4h16v-4" /></svg>
      {{ dropText }}
    </button>
  </li>
</template>

<script setup lang="ts">
import { computed, useTemplateRef } from 'vue'
import { useI18n } from '#imports'
import { focusInPlace } from '@/shared'
import TermChip from './TermChip.vue'

const props = defineProps<{
  number: number
  text: string
  // Слово, стоящее у определения; null — пусто
  placed: string | null
  // Слово, выбранное тапом (запасной путь)
  picked: string | null
  placedPicked: boolean
  // Слово в руке: все клетки — цели
  armed: boolean
  // Слово в руке над этим рядом
  over: boolean
  overTerm: string | null
  // Слово этого ряда сейчас в руке
  ghost: boolean
  disabled: boolean
}>()

const emit = defineEmits<{
  place: []
  chipPress: [event: PointerEvent]
  chipClick: []
  // Delete или Backspace на поставленном слове: слово возвращается к словам
  remove: []
}>()

const { t } = useI18n()
const root = useTemplateRef<HTMLElement>('root')
const drop = useTemplateRef<HTMLButtonElement>('drop')
const chip = useTemplateRef<{ $el: HTMLElement }>('chip')

const dropText = computed(() => {
  if (props.over) return t('matchingPlay.dropRelease')
  if (props.picked) return t('matchingPlay.tapToPlace', { term: props.picked })
  return t('matchingPlay.dropHere')
})

const placedLabel = computed(() => {
  const base = { number: props.number, text: props.text, placed: props.placed ?? '' }
  if (props.picked && !props.placedPicked) return t('matchingPlay.replaceLabel', { ...base, term: props.picked })
  return t('matchingPlay.placedLabel', base)
})

function focus(): void {
  focusInPlace(drop.value ?? chip.value?.$el)
}

defineExpose({ root, focus })
</script>

<style scoped lang="scss">
@use '@/assets/styles/breakpoints.module' as *;

// Запас под липкий лоток: фокус с клавиатуры не прячет клетку под словами
$tray-clearance: 200px;

// Ряд: клетка для слова слева, определение справа, без карточки — как у Wordwall
.definition-card {
  position: relative;
  display: grid;
  grid-template-columns: clamp(132px, 38%, 164px) minmax(0, 1fr);
  grid-template-areas: 'cell text';
  gap: 10px;
  align-items: center;
  padding: 12px 0;
  border-top: 1px solid var(--g-divider);
  transition:
    background-color 0.2s ease,
    box-shadow 0.2s ease;

  &:first-child {
    border-top-color: transparent;
  }

  @include tablet {
    grid-template-columns: 150px minmax(0, 1fr);
    gap: 0 16px;
    padding: 14px 0;
  }

  @include desktop {
    grid-template-columns: 236px minmax(0, 1fr);
    gap: 0 20px;
  }
}

// Корень TermChip получает scope родителя, поэтому правило действует и на поставленное слово
.definition-card button {
  scroll-margin-top: $tray-clearance;

  @include tablet {
    scroll-margin-top: 16px;
  }
}

.definition-card__text {
  grid-area: text;
  margin: 0;
  color: var(--g-text);
  font-size: 15px;
  font-weight: 500;
  line-height: 1.4;
  overflow-wrap: break-word;

  @include tablet {
    max-width: 62ch;
    font-size: 16px;
    line-height: 1.45;
  }

  @include desktop {
    font-size: 18px;
  }
}

.definition-card__sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip-path: inset(50%);
  white-space: nowrap;
}

.definition-card__cell {
  display: flex;
  grid-area: cell;
  align-items: center;
  justify-content: center;
  min-width: 0;
}

// Пустая клетка: пунктир «Перетащите слово сюда»
.definition-card__drop {
  gap: 6px;
  width: 100%;
  min-height: 64px;
  margin: 0;
  padding: 6px 8px;
  border: 3px dashed var(--g-accent);
  border-radius: 16px;
  background: var(--g-surface);
  color: var(--g-muted);
  font: inherit;
  font-size: 14px;
  font-weight: 600;
  line-height: 1.25;
  text-align: center;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
  transition:
    border-color 0.2s ease,
    background-color 0.2s ease;

  &:focus-visible {
    outline: 3px solid var(--g-focus);
    outline-offset: 2px;
  }

  &:disabled {
    cursor: default;
  }

  svg {
    flex: none;
    width: 20px;
    height: 20px;
    fill: none;
    stroke: currentcolor;
    stroke-width: 2.2;
    stroke-linecap: round;
    stroke-linejoin: round;
  }
}

.definition-card--armed .definition-card__drop,
.definition-card--target .definition-card__drop {
  background: var(--g-accent-soft);
  color: var(--g-text);
}

// Под пальцем подсвечивается весь ряд: видно, к какому определению встанет слово
.definition-card--over {
  margin-inline: -8px;
  border-radius: 16px;
  padding-inline: 8px;
  background: var(--g-accent-soft);
  box-shadow: inset 0 0 0 2px var(--g-accent);

  .definition-card__drop {
    border-style: solid;
    color: var(--g-text);
    font-weight: 700;
  }
}

.definition-card__replace {
  display: flex;
  align-items: center;
  width: 100%;
  min-height: 64px;
  padding: 6px 10px;
  border: 3px solid var(--g-accent);
  border-radius: 16px;
  background: var(--g-accent-soft);
  color: var(--g-text);
  font-size: 14px;
  font-weight: 700;
  line-height: 1.3;
}

@media (prefers-reduced-motion: reduce) {
  .definition-card,
  .definition-card__drop {
    transition: none;
  }
}
</style>
