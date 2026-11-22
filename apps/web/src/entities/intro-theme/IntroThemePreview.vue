<template>
  <!-- Кусочек экрана вопроса в стиле: фон, узор платы, карточка с рамкой, вопрос и четыре ответа -->
  <span class="intro-theme-preview" :class="`intro-theme-preview--${tone}`" aria-hidden="true">
    <span class="intro-theme-preview__pcb" />
    <span class="intro-theme-preview__card">
      <span class="intro-theme-preview__dots"><i /><i /><i /></span>
      <span class="intro-theme-preview__question" />
      <span class="intro-theme-preview__options"><i /><i /><i /><i /></span>
    </span>
  </span>
</template>

<script setup lang="ts">
import type { IntroThemeTone } from './types'

defineProps<{
  tone: IntroThemeTone
}>()
</script>

<style scoped lang="scss">
@use '@/assets/styles/mixins' as *;

// Узор мельче, чем в игре: превью маленькое, и крупный узор в нём не читается
$preview-tile-size: 120px;

.intro-theme-preview {
  position: relative;
  display: grid;
  place-items: center;
  width: 100%;
  aspect-ratio: 4 / 3;
  overflow: hidden;
  border-radius: 10px;
  background: var(--preview-bg);

  // Цвета — из сцены Nataskium и палитры игры (NataskiumScene.vue, IntroPlayer.vue)
  &--dark {
    --preview-bg: linear-gradient(180deg, #1a1f45 0%, var(--color-night) 55%, #12162f 100%);
    --preview-pcb-opacity: 0.6;
    --preview-text: rgb(255 255 255 / 0.85);
    --preview-surface: rgb(255 255 255 / 0.12);
    --preview-line: rgb(255 255 255 / 0.5);
  }

  &--light {
    --preview-bg: linear-gradient(180deg, var(--color-white) 0%, #f7f9fe 60%, #eef2fc 100%);
    --preview-pcb-opacity: 0.22;
    --preview-text: rgb(26 33 64 / 0.75);
    --preview-surface: rgb(255 255 255 / 0.62);
    --preview-line: rgb(26 33 64 / 0.55);

    box-shadow: inset 0 0 0 1px rgb(var(--rgb-blue) / 0.2);
  }
}

.intro-theme-preview__pcb {
  position: absolute;
  inset: 0;
  opacity: var(--preview-pcb-opacity);
  background: url($board-pattern) 0 0 / #{$preview-tile-size} auto repeat;
  -webkit-mask-image:
    radial-gradient(ellipse 70% 60% at 100% 0%, #000 0%, transparent 100%),
    radial-gradient(ellipse 70% 60% at 0% 100%, #000 0%, transparent 100%);
  mask-image:
    radial-gradient(ellipse 70% 60% at 100% 0%, #000 0%, transparent 100%),
    radial-gradient(ellipse 70% 60% at 0% 100%, #000 0%, transparent 100%);
}

.intro-theme-preview__card {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 7%;
  width: 72%;
  height: 76%;
  padding: 6% 7%;
  border: 2px solid var(--color-blue);
  border-radius: 9px;
}

.intro-theme-preview__dots {
  display: flex;
  gap: 3px;

  i {
    width: 4px;
    height: 4px;
    border-radius: 50%;

    &:nth-child(1) {
      background: var(--color-green);
    }

    &:nth-child(2) {
      background: var(--color-orange);
    }

    &:nth-child(3) {
      background: var(--color-blue);
    }
  }
}

.intro-theme-preview__question {
  width: 70%;
  height: 9%;
  border-radius: 999px;
  background: var(--preview-text);
}

.intro-theme-preview__options {
  display: grid;
  flex: 1;
  grid-template-columns: 1fr 1fr;
  gap: 8%;

  i {
    border: 1.5px solid var(--preview-line);
    border-radius: 4px;
    background: var(--preview-surface);
  }
}
</style>
