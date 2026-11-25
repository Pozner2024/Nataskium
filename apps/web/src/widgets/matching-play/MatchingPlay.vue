<template>
  <section class="matching-play">
    <p class="matching-play__sr-only" role="status">{{ timer.announcement.value }}</p>

    <p v-if="store.status === 'loading'" class="matching-play__loading" role="status">{{ t('play.loading') }}</p>

    <div v-else-if="store.status === 'notFound'" class="matching-play__status">
      <p class="matching-play__message" role="alert">{{ t('play.notFound') }}</p>
    </div>

    <div v-else-if="store.status === 'changed'" class="matching-play__status">
      <p class="matching-play__message" role="alert">{{ t('play.changed') }}</p>
      <button class="matching-play__button" type="button" @click="store.start()">{{ t('play.restart') }}</button>
    </div>

    <div v-else-if="store.status === 'failed'" class="matching-play__status">
      <p class="matching-play__message" role="alert">{{ t('play.failed') }}</p>
      <button class="matching-play__button" type="button" @click="store.retry()">{{ t('play.retry') }}</button>
    </div>

    <MatchingResult v-else-if="store.phase === 'result'" />
    <MatchingBoard v-else />
  </section>
</template>

<script setup lang="ts">
import { onBeforeUnmount, onMounted, provide } from 'vue'
import { useI18n, useSeoMeta } from '#imports'
import type { PlayMatchingResponse } from '@/entities/matching'
import { PLAY_TIMER_KEY, usePlayerPause, usePlayerScrollRelease } from '@/features/play-session'
import type { PlaySource } from '@/shared'
import MatchingBoard from './components/MatchingBoard.vue'
import MatchingResult from './components/MatchingResult.vue'
import { useMatchingPlayStore } from './store'
import { useMatchingPlayTimer } from './useMatchingPlayTimer'

// initial — ответ GET, уже полученный PlayPage; без него виджет загружает задание сам
const props = defineProps<{ source: PlaySource; initial?: PlayMatchingResponse }>()

const { t } = useI18n()
const store = useMatchingPlayStore()
usePlayerPause(store.pauseClock, store.resumeClock)

const timer = useMatchingPlayTimer()
provide(PLAY_TIMER_KEY, timer)
usePlayerScrollRelease(() => store.status !== 'ready' || store.phase === 'result')

useSeoMeta({ title: () => store.title, robots: 'noindex, nofollow' })

onMounted(() => store.start(props.source, props.initial))
// Стор живёт между показами: без очистки следующий показ на миг рисует старое задание и теряет вылет
onBeforeUnmount(() => store.dispose())
</script>

<style scoped lang="scss">
@use '@/assets/styles/mixins' as *;
@use '@/assets/styles/breakpoints.module' as *;

// Колонка игры на фоне проигрывателя. На широком экране — во всю ширину слота: нижняя полоса «Проверить»
// липнет к его низу, поэтому снизу отступа нет
.matching-play {
  display: flex;
  flex-direction: column;
  width: 100%;
  max-width: 560px;
  min-height: 100%;
  margin: 0 auto;
  padding: 8px var(--gutter) 24px;
  color: var(--g-text);

  @include tablet {
    max-width: none;
    padding: 0;
  }
}

.matching-play__sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip-path: inset(50%);
  white-space: nowrap;
}

.matching-play__loading {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 14px;
  margin: 48px 0 0;
  color: var(--g-muted);
  font-weight: 500;

  &::before {
    content: '';
    width: 36px;
    height: 36px;
    border: 4px solid var(--g-surface);
    border-top-color: var(--g-accent);
    border-radius: 50%;
    animation: matching-play-spin 0.9s linear infinite;
  }

  @media (prefers-reduced-motion: reduce) {
    &::before {
      animation: none;
    }
  }
}

@keyframes matching-play-spin {
  to {
    transform: rotate(1turn);
  }
}

.matching-play__status {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 20px;
  margin-top: 32px;
  padding: 28px 20px 24px;
  text-align: center;
}

.matching-play__message {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 14px;
  margin: 0;
  font-size: 18px;
  font-weight: 600;
  line-height: 1.4;
  overflow-wrap: anywhere;

  &::before {
    content: '!';
    content: '!' / '';
    display: grid;
    place-items: center;
    width: 44px;
    height: 44px;
    border-radius: 50%;
    background: var(--color-orange-dark);
    color: var(--color-white);
    font-family: var(--font-display);
    font-size: 22px;
    font-weight: 700;
    line-height: 1;
  }
}

.matching-play__button {
  @include play-secondary;
}
</style>
