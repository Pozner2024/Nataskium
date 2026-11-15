<template>
  <!-- Мышь навели или нажали — Нат оживает; обёртка ловит события сцены всплытием -->
  <div class="still-nat" @pointerenter="onPointerEnter" @click="wake">
    <slot />
  </div>
</template>

<script setup lang="ts">
import { NAT_STILL_AWAKE_MS } from '../natStill'
import { provideNatStill } from '@/shared'

// Свой провайдер у каждого Ната: разбуженный не будит соседей
const { wake } = provideNatStill(NAT_STILL_AWAKE_MS)

// Касание пальцем тоже даёт pointerenter — его ловит click, а здесь только наведение мыши
function onPointerEnter(event: PointerEvent) {
  if (event.pointerType === 'mouse') wake()
}
</script>
