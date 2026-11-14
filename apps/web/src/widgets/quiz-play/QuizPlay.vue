<template>
  <section class="quiz-play">
    <p v-if="store.status === 'loading'" class="quiz-play__loading" role="status">{{ t('play.loading') }}</p>

    <div v-else-if="store.status === 'notFound'" class="quiz-play__status">
      <p class="quiz-play__message" role="alert">{{ t('play.notFound') }}</p>
    </div>

    <div v-else-if="store.status === 'changed'" class="quiz-play__status">
      <p class="quiz-play__message" role="alert">{{ t('play.changed') }}</p>
      <button class="quiz-play__button" type="button" @click="store.start()">{{ t('play.restart') }}</button>
    </div>

    <div v-else-if="store.status === 'failed'" class="quiz-play__status">
      <p class="quiz-play__message" role="alert">{{ t('play.failed') }}</p>
      <button class="quiz-play__button" type="button" @click="store.retry()">{{ t('play.retry') }}</button>
    </div>

    <PlayResult v-else-if="store.phase === 'result'" />
    <PlayQuestion v-else />
  </section>
</template>

<script setup lang="ts">
import { onMounted } from 'vue'
import { navigateTo, useI18n, useSeoMeta, useSwitchLocalePath } from '#imports'
import { useCurrentLocale } from '@/shared'
import PlayQuestion from './components/PlayQuestion.vue'
import PlayResult from './components/PlayResult.vue'
import { pickPlayLocale } from './pickPlayLocale'
import { usePlayStore } from './store'

const props = defineProps<{ token: string }>()

const { t } = useI18n()
const store = usePlayStore()
const currentLocale = useCurrentLocale()
const switchLocalePath = useSwitchLocalePath()

useSeoMeta({ title: () => store.title, robots: 'noindex, nofollow' })

// Язык игры определяет только браузер ученика. Страница отрисовывается только в браузере
onMounted(async () => {
  const locale = pickPlayLocale(navigator.languages)
  const target = switchLocalePath(locale)
  if (locale !== currentLocale.value && target !== '') {
    await navigateTo(target, { replace: true })
    return
  }
  await store.start(props.token)
})
</script>

<style scoped lang="scss">
@use '@/assets/styles/mixins' as *;

.quiz-play {
  display: flex;
  flex: 1;
  flex-direction: column;
  width: 100%;
  max-width: 560px;
  margin: 0 auto;
  padding: 8px var(--gutter) 24px;
}

.quiz-play__loading {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 14px;
  margin: 48px 0 0;
  color: var(--color-text-muted);
  font-weight: 500;

  &::before {
    content: '';
    width: 36px;
    height: 36px;
    border: 4px solid rgb(var(--rgb-blue) / 0.18);
    border-top-color: var(--color-blue);
    border-radius: 50%;
    animation: quiz-play-spin 0.9s linear infinite;
  }

  @media (prefers-reduced-motion: reduce) {
    &::before {
      animation: none;
    }
  }
}

@keyframes quiz-play-spin {
  to {
    transform: rotate(1turn);
  }
}

.quiz-play__status {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 20px;
  margin-top: 32px;
  padding: 28px 20px 24px;
  border-radius: 22px;
  text-align: center;
  @include card-surface;
}

.quiz-play__message {
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

.quiz-play__button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 48px;
  padding: 8px 24px;
  border: 0;
  border-radius: 14px;
  background: rgb(var(--rgb-blue) / 0.1);
  color: var(--color-blue-dark);
  font: inherit;
  font-weight: 700;
  line-height: 1.2;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
  transition: background-color 0.2s ease;

  @media (hover: hover) {
    &:hover {
      background: rgb(var(--rgb-blue) / 0.16);
    }
  }

  &:active {
    background: rgb(var(--rgb-blue) / 0.24);
  }
}
</style>
