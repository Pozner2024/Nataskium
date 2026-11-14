<template>
  <div v-if="store.result" class="play-result">
    <h1 ref="heading" class="play-result__title" tabindex="-1">{{ t('play.finished', { title: store.title }) }}</h1>
    <p class="play-result__percent">{{ t('play.percent', { percent: store.result.percent }) }}</p>

    <p v-if="store.result.grade !== null" class="play-result__grade">
      {{ t('play.grade', { grade: store.result.grade }) }}
    </p>
    <template v-else>
      <p class="play-result__stat">
        {{ t('play.correctOf', { correct: store.result.correctCount, total: store.result.totalCount }) }}
      </p>
      <p class="play-result__stat">{{ t('play.partial', { count: store.result.partialCount }) }}</p>
    </template>

    <button class="play-result__again" type="button" :disabled="store.busy" @click="store.start()">
      {{ t('play.again') }}
    </button>
  </div>
</template>

<script setup lang="ts">
import { onMounted, useTemplateRef } from 'vue'
import { useI18n } from '#imports'
import { usePlayStore } from '../store'

const { t } = useI18n()
const store = usePlayStore()
const heading = useTemplateRef<HTMLElement>('heading')

onMounted(() => heading.value?.focus())
</script>

<style scoped lang="scss">
@use '@/assets/styles/mixins' as *;

.play-result {
  display: flex;
  flex-direction: column;
  align-items: center;
  margin-top: 24px;
  padding: 28px 20px 24px;
  border-radius: 22px;
  text-align: center;
  @include card-surface;
}

.play-result__title {
  margin: 0;
  border-radius: 8px;
  font-size: 18px;
  font-weight: 600;
  line-height: 1.4;
  overflow-wrap: anywhere;
}

.play-result__percent {
  margin: 12px 0 0;
  color: var(--color-blue);
  font-family: var(--font-display);
  font-size: 60px;
  font-weight: 700;
  line-height: 1.1;
  white-space: nowrap;
}

.play-result__grade {
  margin: 16px 0 0;
  padding: 8px 20px;
  border-radius: 999px;
  background: rgb(var(--rgb-green) / 0.14);
  color: var(--color-text);
  font-size: 22px;
  font-weight: 700;
  line-height: 1.3;
}

.play-result__stat {
  margin: 12px 0 0;
  font-size: 18px;
  font-weight: 600;
  line-height: 1.35;

  & + & {
    margin-top: 4px;
    color: var(--color-text-muted);
  }
}

.play-result__again {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  min-height: 56px;
  margin-top: 28px;
  padding: 8px 20px;
  border: 0;
  border-radius: 999px;
  background: var(--color-orange);
  box-shadow: 0 10px 24px rgb(var(--rgb-orange) / 0.4);
  color: var(--color-white);
  font: inherit;
  font-size: 18px;
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

  &:disabled {
    cursor: progress;
    opacity: 0.7;
    box-shadow: none;
  }

  @media (prefers-reduced-motion: reduce) {
    transition: none;

    &:active:not(:disabled) {
      transform: none;
    }
  }
}
</style>
