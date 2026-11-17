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
.term-chip {
  position: relative;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  min-width: 0;
  min-height: 64px;
  margin: 0;
  padding: 10px 18px 10px 10px;
  border: 2px solid rgb(var(--rgb-blue) / 0.45);
  border-bottom-width: 5px;
  border-radius: 18px;
  background: var(--color-white);
  box-shadow: 0 4px 12px rgb(var(--rgb-night) / 0.08);
  color: var(--color-text);
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
      border-color: var(--color-blue);
      box-shadow: 0 8px 18px rgb(var(--rgb-blue) / 0.18);
    }
  }

  &:focus-visible {
    outline: 3px solid var(--focus-color);
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
  color: var(--color-blue-light);

  svg {
    width: 14px;
    height: 22px;
    fill: currentcolor;
  }
}

.term-chip__text {
  min-width: 0;
  overflow-wrap: break-word;
}

.term-chip--placed {
  flex: 0 1 auto;
  width: auto;
  min-height: 60px;
  box-shadow: none;
  touch-action: none;
}

.term-chip--picked {
  border-color: var(--color-blue-dark);
  background: rgb(var(--rgb-blue) / 0.12);
  box-shadow: 0 0 0 3px rgb(var(--rgb-blue) / 0.35);
  color: var(--color-blue-dark);
}

.term-chip--ghost {
  border: 3px dashed rgb(var(--rgb-blue) / 0.35);
  background: rgb(var(--rgb-blue) / 0.04);
  box-shadow: none;
  color: transparent;

  .term-chip__grip {
    visibility: hidden;
  }
}

.term-chip--lifted {
  border-color: var(--color-blue-dark);
  background: var(--color-blue-dark);
  box-shadow: 0 22px 40px rgb(var(--rgb-night) / 0.35);
  color: var(--color-white);
  transform: rotate(-3deg) scale(1.06);
  cursor: grabbing;
  pointer-events: none;
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
