<template>
  <div class="answer-buttons" role="group" :aria-label="t('play.trueFalse.choices')">
    <button
      v-for="option in OPTIONS"
      :key="option.name"
      class="answer-buttons__button"
      :class="buttonClass(option.value)"
      type="button"
      :aria-pressed="chosen === option.value"
      :disabled="disabled"
      @click="emit('answer', option.value)"
    >
      <span class="answer-buttons__icon" aria-hidden="true">{{ option.icon }}</span>
      <span class="answer-buttons__label">{{ t(`play.trueFalse.${option.name}`) }}</span>
      <span v-if="chosen === option.value && verdict !== null" class="answer-buttons__badge" aria-hidden="true">{{ verdict ? '✓' : '✗' }}</span>
    </button>
  </div>
</template>

<script setup lang="ts">
import { useI18n } from '#imports'

const OPTIONS = [
  { name: 'yes', value: true, icon: '✓' },
  { name: 'no', value: false, icon: '✕' },
] as const

const props = defineProps<{
  // Выбранный ответ на текущее утверждение; null — ещё не выбран
  chosen: boolean | null
  disabled: boolean
  // Верность выбранного ответа после check; null — не проверялось
  verdict: boolean | null
}>()

const emit = defineEmits<{ answer: [value: boolean] }>()

const { t } = useI18n()

function buttonClass(value: boolean): Record<string, boolean> {
  const isChosen = props.chosen === value
  return {
    'answer-buttons__button--chosen': isChosen,
    'answer-buttons__button--correct': isChosen && props.verdict === true,
    'answer-buttons__button--wrong': isChosen && props.verdict === false,
  }
}
</script>

<style scoped lang="scss">
@use '@/assets/styles/breakpoints.module' as *;

.answer-buttons {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
  margin-top: 18px;

  @include tablet {
    gap: 14px;
  }

  @include desktop {
    gap: 16px;
  }
}

.answer-buttons__button {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 6px;
  min-height: 96px;
  padding: 12px 10px;
  border: 2px solid var(--g-line);
  border-radius: 18px;
  background: var(--g-surface);
  color: var(--g-text);
  font: inherit;
  font-size: 18px;
  font-weight: 700;
  line-height: 1.3;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
  transition:
    background-color 0.2s ease,
    border-color 0.2s ease,
    box-shadow 0.2s ease,
    transform 0.2s ease;

  @media (hover: hover) {
    &:hover:not(:disabled) {
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
    min-height: 120px;
    font-size: 22px;
  }

  @include desktop {
    min-height: 140px;
    font-size: 26px;
  }

  :fullscreen & {
    @include desktop {
      min-height: 170px;
      border-radius: 24px;
      font-size: 30px;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    transition: none;

    &:active:not(:disabled) {
      transform: none;
    }
  }
}

.answer-buttons__icon {
  display: grid;
  place-items: center;
  width: 34px;
  height: 34px;
  border-radius: 50%;
  box-shadow: inset 0 0 0 2px var(--g-line);
  font-size: 18px;
  font-weight: 800;
  line-height: 1;
}

// Значок верности в углу выбранной кнопки: цвет дублируется формой
.answer-buttons__badge {
  position: absolute;
  top: 6px;
  right: 6px;
  display: grid;
  place-items: center;
  width: 24px;
  height: 24px;
  border-radius: 50%;
  background: var(--g-text);
  color: var(--g-surface);
  font-size: 14px;
  font-weight: 800;
  line-height: 1;
}

.answer-buttons__button--correct .answer-buttons__badge {
  background: var(--g-ok);
  color: var(--color-white);
}

.answer-buttons__button--wrong .answer-buttons__badge {
  background: var(--g-bad);
  color: var(--color-white);
}

.answer-buttons__button--chosen,
.answer-buttons__button--chosen:disabled {
  border-color: var(--g-accent);
  background: var(--g-accent-soft);
  box-shadow: inset 0 0 0 2px var(--g-accent);
}

.answer-buttons__button--correct,
.answer-buttons__button--correct:disabled {
  border-color: var(--g-ok);
  background: var(--g-ok-soft);
  box-shadow: inset 0 0 0 2px var(--g-ok);
}

.answer-buttons__button--wrong,
.answer-buttons__button--wrong:disabled {
  border-color: var(--g-bad);
  background: var(--g-bad-soft);
  box-shadow: inset 0 0 0 2px var(--g-bad);
}
</style>
