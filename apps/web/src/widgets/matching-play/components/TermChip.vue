<template>
  <component
    :is="lifted ? 'div' : 'button'"
    class="term-chip"
    :class="{
      'term-chip--placed': placed,
      'term-chip--picked': picked,
      'term-chip--ghost': ghost,
      'term-chip--lifted': lifted,
    }"
    :type="lifted ? undefined : 'button'"
    :aria-pressed="lifted ? undefined : picked"
    :aria-hidden="lifted ? 'true' : undefined"
  >
    <span class="term-chip__grip" aria-hidden="true">
      <svg viewBox="0 0 14 22">
        <circle cx="4" cy="4" r="2" />
        <circle cx="10" cy="4" r="2" />
        <circle cx="4" cy="11" r="2" />
        <circle cx="10" cy="11" r="2" />
        <circle cx="4" cy="18" r="2" />
        <circle cx="10" cy="18" r="2" />
      </svg>
    </span>
    <span class="term-chip__text">{{ text }}</span>
  </component>
</template>

<script setup lang="ts">
defineProps<{
  text: string
  // Стоит у определения: узкая, свайп по ней берёт слово, а не листает
  placed?: boolean
  picked?: boolean
  // Место, откуда слово взяли перетаскиванием
  ghost?: boolean
  // Копия слова «в руке», следует за пальцем
  lifted?: boolean
}>()
</script>

<style scoped lang="scss">
// Плоская плитка с точками-ручкой: видно, что её можно взять. Цвета — тема проигрывателя
.term-chip {
  position: relative;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  min-width: 0;
  min-height: 52px;
  margin: 0;
  padding: 8px 18px 8px 10px;
  border: 2px solid var(--g-line);
  border-radius: 18px;
  background: var(--g-chip);
  color: var(--g-text);
  font: inherit;
  font-size: 19px;
  font-weight: 700;
  line-height: 1.25;
  text-align: start;
  cursor: grab;
  // Свайп вбок листает лоток, вниз или по диагонали — берёт слово
  touch-action: pan-x;
  user-select: none;
  -webkit-touch-callout: none;
  -webkit-tap-highlight-color: transparent;
  transition:
    transform 0.2s ease,
    box-shadow 0.2s ease,
    border-color 0.2s ease;

  @media (hover: hover) {
    &:hover:not(:disabled) {
      border-color: var(--g-accent);
    }
  }

  &:focus-visible {
    outline: 3px solid var(--g-focus);
    outline-offset: 2px;
  }

  &:disabled {
    cursor: default;
  }
}

.term-chip__grip {
  display: grid;
  flex: none;
  place-items: center;
  width: 20px;
  color: var(--g-accent);

  svg {
    width: 14px;
    height: 22px;
    fill: currentcolor;
  }
}

.term-chip__text {
  min-width: 0;
  overflow-wrap: break-word;
  hyphens: auto;
}

.term-chip--placed {
  min-height: 52px;
  padding: 8px 10px 8px 6px;
  font-size: 16px;
  touch-action: none;
}

.term-chip--picked {
  border-color: var(--g-accent);
  background: var(--g-accent-soft);
  box-shadow: 0 0 0 3px var(--g-accent-soft);
}

.term-chip--ghost {
  border: 3px dashed var(--g-line);
  background: none;
  color: transparent;

  .term-chip__grip {
    visibility: hidden;
  }
}

// Копия в руке — position: fixed у родителя; transform здесь на самой плитке, а не на её предках
.term-chip--lifted {
  border-color: #ffffff;
  background: var(--g-hand);
  box-shadow: 0 22px 40px rgb(0 0 0 / 0.45);
  color: #ffffff;
  transform: rotate(-3deg) scale(1.06);
  cursor: grabbing;
  pointer-events: none;

  .term-chip__grip {
    color: #cfdcff;
  }
}

@media (prefers-reduced-motion: reduce) {
  .term-chip {
    transition: none;
  }

  .term-chip--lifted {
    transform: none;
  }
}
</style>
