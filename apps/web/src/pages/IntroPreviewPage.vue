<template>
  <div v-if="themeKey && themeFrame" class="intro-preview-page__theme">
    <IntroTheme ref="themePreview" :theme-key="themeKey" :state="themeState" />
  </div>
  <IntroPlayer
    v-else
    :key="runKey"
    :src="videoSrc"
    :intro-theme="themeKey"
    :style="{ '--header-height': '0px' }"
    :type-label="intro.typeLabel"
    title="Математика цивилизаций"
    :hint="intro.hint"
    start-label="Начать"
    skip-label="Пропустить заставку"
    enter-fullscreen-label="На весь экран"
    exit-fullscreen-label="Выйти из полноэкранного режима"
    collapse-label="Свернуть"
    scroll-down-label="Прокрутить вниз"
    unmute-label="Включить звук"
    mute-label="Выключить звук"
  >
    <main class="intro-preview-page">
      <div class="intro-preview-page__banner">
        <h1 class="intro-preview-page__title">Математика цивилизаций</h1>
        <p class="intro-preview-page__subtitle">{{ intro.hint }}</p>
      </div>
      <ul class="intro-preview-page__cards">
        <li v-for="(card, index) in CARDS" :key="card" class="intro-preview-page__card">
          <span class="intro-preview-page__badge" :class="`intro-preview-page__badge--${BADGES[index % BADGES.length]}`">
            {{ LETTERS[index] }}
          </span>
          {{ card }}
        </li>
      </ul>
      <button type="button" class="intro-preview-page__restart" @click="runKey++">Ещё раз</button>
    </main>
  </IntroPlayer>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, useTemplateRef } from 'vue'
import { useRoute, useSeoMeta } from '#imports'
import { IntroPlayer } from '@/widgets/intro-player'
import { IntroTheme } from '@/entities/intro-theme'

useSeoMeta({ robots: 'noindex, nofollow' })

const DEFAULT_SRC = '/intro/test.mp4'
const CARDS = ['VII', '19', 'XIII', '2', 'XX', '9']
const BADGES = ['blue', 'green', 'orange', 'graphite']
const LETTERS = ['А', 'Б', 'В', 'Г', 'Д', 'Е']

const INTROS = {
  quiz: { typeLabel: 'Викторина', hint: 'Выберите правильный ответ' },
  match: { typeLabel: 'Сопоставить', hint: 'Перетащите каждое ключевое слово к его определению' },
}

const route = useRoute()
const runKey = ref(0)

// Только локальные пути из безопасных символов: схемы, хосты и выход из папки отбрасываются
const SAFE_SRC = /^\/intro\/[\w.-]+(\/[\w.-]+)*$/

function isAllowedSrc(value: string): boolean {
  return SAFE_SRC.test(value) && !value.includes('..')
}

const intro = computed(() => (route.query.type === 'match' ? INTROS.match : INTROS.quiz))

// Тема кодом: ?theme=<ключ> — в проигрывателе со стартовым экраном (неизвестный ключ — тема по умолчанию).
// Только сцена: ?frame=logo — кадр с собранным лого, ?frame=intro — интро сразу после загрузки (повтор — перезагрузить)
const themeKey = computed(() => (typeof route.query.theme === 'string' ? route.query.theme : null))
const themeFrame = computed(() => route.query.frame === 'logo' || route.query.frame === 'intro')
const themeState = computed(() => (route.query.frame === 'logo' ? 'assembled' : 'clean'))
const themePreview = useTemplateRef<InstanceType<typeof IntroTheme>>('themePreview')

onMounted(() => {
  if (route.query.frame === 'intro') themePreview.value?.play()
})

const videoSrc = computed(() => {
  const raw = route.query.src
  return typeof raw === 'string' && isAllowedSrc(raw) ? raw : DEFAULT_SRC
})
</script>

<style scoped lang="scss">
.intro-preview-page__theme {
  position: relative;
  height: 100dvh;
}

.intro-preview-page {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 24px;
  padding: 16px 12px 24px;

  &__banner {
    padding: 22px 20px;
    border: 3px solid var(--color-blue-light);
    border-radius: 28px;
    background: var(--color-night);
    box-shadow:
      0 7px 0 rgb(0 0 0 / 0.5),
      0 0 36px rgb(var(--rgb-blue) / 0.4);
    text-align: center;
  }

  &__title {
    margin: 0;
    color: var(--color-white);
    font-family: var(--font-display);
    font-size: 24px;
    font-weight: 700;
    line-height: 1.22;
  }

  &__subtitle {
    margin: 10px 0 0;
    color: var(--color-white);
    font-family: var(--font-body);
    font-size: 16px;
  }

  &__cards {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 16px;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  &__card {
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    min-height: 120px;
    padding: 14px;
    border-radius: 24px;
    background: var(--color-white);
    color: var(--color-text);
    font-family: var(--font-display);
    font-size: 24px;
    font-weight: 700;
    box-shadow: 0 7px 0 rgb(0 0 0 / 0.45);
  }

  &__badge {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 46px;
    height: 46px;
    border-radius: 14px;
    color: var(--color-text);
    font-size: 20px;

    &--blue {
      background: var(--color-blue-light);
    }

    &--green {
      background: var(--color-green-light);
    }

    &--orange {
      background: var(--color-orange-light);
    }

    &--graphite {
      background: #3b404c;
      color: var(--color-white);
    }
  }

  &__restart {
    align-self: center;
    min-width: 44px;
    min-height: 48px;
    padding: 0 28px;
    border: 3px solid var(--color-blue-light);
    border-radius: 24px;
    background: var(--color-night);
    color: var(--color-white);
    font-family: var(--font-body);
    font-size: 16px;
    font-weight: 700;
    cursor: pointer;

    &:focus-visible {
      outline: 4px solid var(--color-white);
      outline-offset: 3px;
    }
  }
}
</style>
