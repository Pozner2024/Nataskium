<template>
  <div
    ref="card"
    class="entrance-card"
    :class="{
      'entrance-card--framed': entrance.framed.value,
      'entrance-card--waiting': entrance.hasEntrance && !ready,
      'entrance-card--entering': !entrance.landed.value,
    }"
  >
    <span v-if="entrance.framed.value" ref="dots" class="entrance-card__dots" aria-hidden="true">
      <i class="entrance-card__dot entrance-card__dot--green" />
      <i class="entrance-card__dot entrance-card__dot--orange" />
      <i class="entrance-card__dot entrance-card__dot--blue" />
    </span>
    <slot />
  </div>
</template>

<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref, useTemplateRef, watch } from 'vue'
import { useFirstEntrance } from './useFirstEntrance'

// Карточка первого задания в проигрывателе с темой кодом (ADR 0015): рамка с точками окна у темы,
// вылет у первого задания после интро. items — селектор элементов, которые появляются по очереди.
// Дорожка сигнала не заходит на то, что стоит прямо над карточкой (полоса прогресса задания).
// landed: played — вылет был (игра начинает отсчёт таймера с этого момента)
// swapKey — номер показанного задания: при его смене содержимое меняется анимацией темы
const { items, swapKey = 0 } = defineProps<{ items: string; swapKey?: number }>()

// entering — вылет начинается (игра придерживает таймер); landed — задание на месте
const emit = defineEmits<{ entering: []; landed: [played: boolean] }>()

const card = useTemplateRef<HTMLElement>('card')
const dots = useTemplateRef<HTMLElement>('dots')
const entrance = useFirstEntrance()
const ready = ref(false)

// Граница дорожки сверху: то, что стоит прямо над карточкой, а если над ней ничего нет — верх блока задания
function ceilingOf(element: HTMLElement): HTMLElement | null {
  const above = element.previousElementSibling
  if (above instanceof HTMLElement) return above
  return element.parentElement
}

onMounted(async () => {
  if (!entrance.hasEntrance || !card.value) {
    emit('landed', false)
    return
  }
  emit('entering')
  try {
    await entrance.play({
      card: card.value,
      dots: dots.value,
      items: [...card.value.querySelectorAll<HTMLElement>(items)],
      ceiling: ceilingOf(card.value),
      onReady: () => (ready.value = true),
    })
  } finally {
    // Даже если вылет сорвался, задание показывается и игра получает фокус
    ready.value = true
    emit('landed', true)
  }
})

// Смена задания (swapKey): Vue обновляет содержимое на месте, затем оно появляется анимацией темы
let unmounted = false
watch(
  () => swapKey,
  async () => {
    await nextTick()
    if (unmounted || !card.value || !entrance.landed.value) return
    await entrance.swap({ card: card.value, items: [...card.value.querySelectorAll<HTMLElement>(items)] })
  },
)

onBeforeUnmount(() => {
  unmounted = true
  entrance.cancel()
})
</script>

<style scoped lang="scss">
@use '@/assets/styles/breakpoints.module' as *;

.entrance-card {
  position: relative;

  // До вылета карточку не видно, иначе на кадр мелькнёт готовое задание
  &--waiting {
    visibility: hidden;
  }

  // --entrance-bleed: насколько содержимое может выходить за края колонки; в рамке — не выходит
  &--framed {
    --entrance-bleed: 0px;

    margin-top: 16px;
    padding: 16px 16px 20px;
    border: 3px solid var(--color-blue);
    border-radius: 24px;

    @include tablet {
      padding: 20px 24px 24px;
      border-radius: 32px;
    }
  }

  // Во время вылета рамку рисует сигнал поверх прозрачной рамки карточки (правило после --framed, чтобы перекрыть цвет)
  &--entering {
    border-color: transparent;
  }
}

.entrance-card__dots {
  display: flex;
  gap: 8px;
}

.entrance-card__dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;

  &--green {
    background: var(--color-green);
  }

  &--orange {
    background: var(--color-orange);
  }

  &--blue {
    background: var(--color-blue);
  }
}
</style>
