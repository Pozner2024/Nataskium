<template>
  <li
    ref="root"
    class="definition-card"
    :class="{
      'definition-card--armed': armed,
      'definition-card--over': over,
      'definition-card--filled': placed !== null && !ghost,
    }"
  >
    <span class="definition-card__number" aria-hidden="true">{{ number }}</span>
    <span class="definition-card__text">
      <span class="definition-card__sr-only">{{ t('matchingPlay.definitionNumber', { number }) }}</span>{{ text }}
    </span>

    <div v-if="placed !== null && !ghost" class="definition-card__drop">
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
      />
      <button
        class="definition-card__remove"
        type="button"
        :disabled="disabled"
        :aria-label="t('matchingPlay.removeLabel', { term: placed })"
        @click="emit('remove')"
      >
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" /></svg>
      </button>
    </div>

    <button
      v-else
      ref="drop"
      class="definition-card__drop"
      type="button"
      :disabled="disabled"
      :aria-label="picked ? t('matchingPlay.placeLabel', { number, text, term: picked }) : t('matchingPlay.emptyLabel', { number, text })"
      @click="emit('place')"
    >
      <span class="definition-card__drop-empty">
        <svg v-if="!over" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v11M7.5 9.5 12 14l4.5-4.5M4 15v4h16v-4" /></svg>
        {{ dropText }}
      </span>
    </button>
  </li>
</template>

<script setup lang="ts">
import { computed, useTemplateRef } from 'vue'
import { useI18n } from '#imports'
import TermChip from './TermChip.vue'

const props = defineProps<{
  number: number
  text: string
  // Слово, стоящее у определения; null — пусто
  placed: string | null
  // Слово, выбранное тапом (запасной путь)
  picked: string | null
  placedPicked: boolean
  // Слово в руке: все карточки — цели
  armed: boolean
  // Слово в руке над этой карточкой
  over: boolean
  overTerm: string | null
  // Слово этой карточки сейчас в руке
  ghost: boolean
  disabled: boolean
}>()

const emit = defineEmits<{
  place: []
  chipPress: [event: PointerEvent]
  chipClick: []
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
  ;(drop.value ?? chip.value?.$el)?.focus()
}

defineExpose({ root, focus })
</script>

<style scoped lang="scss">
// Запас под липкий лоток (шапка учтена в scroll-padding-top страницы): фокус с клавиатуры не прячет поле под словами
$tray-clearance: 200px;

.definition-card {
  display: grid;
  grid-template-columns: 40px minmax(0, 1fr);
  gap: 12px 14px;
  padding: 16px;
  border: 2px solid rgb(var(--rgb-blue) / 0.2);
  border-radius: 22px;
  background: var(--color-white);
  box-shadow: 0 6px 16px rgb(var(--rgb-night) / 0.07);
  transition:
    border-color 0.2s ease,
    box-shadow 0.2s ease;
}

// Корень TermChip получает scope родителя, поэтому правило действует и на поставленное слово
.definition-card button {
  scroll-margin-top: $tray-clearance;
}

.definition-card__number {
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

.definition-card__text {
  align-self: center;
  font-size: 18px;
  font-weight: 500;
  line-height: 1.4;
  overflow-wrap: break-word;
}

.definition-card__sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip-path: inset(50%);
  white-space: nowrap;
}

.definition-card__drop {
  display: flex;
  grid-column: 1 / -1;
  align-items: center;
  gap: 10px;
  width: 100%;
  min-height: 76px;
  margin: 0;
  padding: 6px;
  border: 3px dashed rgb(var(--rgb-blue) / 0.4);
  border-radius: 18px;
  background: rgb(var(--rgb-blue) / 0.04);
  color: var(--color-text-muted);
  font: inherit;
  font-size: 16px;
  font-weight: 600;
  line-height: 1.3;
  text-align: start;
  transition:
    border-color 0.2s ease,
    background-color 0.2s ease;

  &:is(button) {
    cursor: pointer;
    -webkit-tap-highlight-color: transparent;
  }

  &:focus-visible {
    outline: 3px solid var(--focus-color);
    outline-offset: 2px;
  }
}

.definition-card__drop-empty {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 0 10px;

  svg {
    flex: none;
    width: 26px;
    height: 26px;
    fill: none;
    stroke: currentcolor;
    stroke-width: 2.2;
    stroke-linecap: round;
    stroke-linejoin: round;
  }
}

.definition-card--armed .definition-card__drop {
  border-color: var(--color-blue);
  background: rgb(var(--rgb-blue) / 0.08);
  color: var(--color-blue-dark);
}

.definition-card--filled .definition-card__drop {
  border-style: solid;
  border-color: rgb(var(--rgb-blue) / 0.3);
  background: rgb(var(--rgb-blue) / 0.06);
}

.definition-card--over {
  border-color: var(--color-blue-dark);
  box-shadow:
    0 0 0 4px rgb(var(--rgb-blue) / 0.25),
    0 10px 24px rgb(var(--rgb-blue) / 0.25);

  .definition-card__drop {
    border-style: solid;
    border-color: var(--color-blue-dark);
    background: rgb(var(--rgb-blue) / 0.14);
    color: var(--color-blue-dark);
    font-weight: 700;
  }
}

.definition-card__replace {
  flex: 1;
  padding: 0 6px;
  color: var(--color-blue-dark);
  font-size: 15px;
  font-weight: 700;
  line-height: 1.3;
}

// ✕ — запасной путь «вернуть слово», нарочно неброский
.definition-card__remove {
  display: grid;
  flex: none;
  place-items: center;
  width: 48px;
  height: 48px;
  margin-left: auto;
  border: 0;
  border-radius: 14px;
  background: none;
  color: var(--color-text-muted);
  cursor: pointer;

  @media (hover: hover) {
    &:hover:not(:disabled) {
      background: rgb(var(--rgb-blue) / 0.1);
      color: var(--color-blue-dark);
    }
  }

  &:focus-visible {
    outline: 3px solid var(--focus-color);
    outline-offset: 2px;
  }

  svg {
    width: 20px;
    height: 20px;
    fill: none;
    stroke: currentcolor;
    stroke-width: 2.4;
    stroke-linecap: round;
  }
}

@media (prefers-reduced-motion: reduce) {
  .definition-card,
  .definition-card__drop {
    transition: none;
  }
}
</style>
