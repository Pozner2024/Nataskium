<template>
  <section class="play-panel" :aria-label="t('playPanel.label')">
    <h2 class="play-panel__title">{{ title }}</h2>

    <div class="play-panel__actions">
      <button class="play-panel__button play-panel__button--create" type="button" @click="createActivity">
        {{ t('playPanel.create') }}
      </button>
      <button class="play-panel__button" type="button" @click="copyLink">{{ t('playPanel.copyLink') }}</button>
    </div>
    <div class="play-panel__settings">
      <button
        class="play-panel__button play-panel__button--icon"
        type="button"
        :aria-label="t('playPanel.settings')"
        :title="t('playPanel.settings')"
        aria-controls="play-panel-settings"
        :aria-expanded="isSettingsOpen"
        @click="isSettingsOpen = !isSettingsOpen"
      >
        <svg class="play-panel__icon" viewBox="0 0 24 24" aria-hidden="true"><path :d="GEAR_ICON" /></svg>
      </button>
      <!-- Пункты появятся по мере готовности функций; пока видно, что будет -->
      <ul v-if="isSettingsOpen" id="play-panel-settings" class="play-panel__menu">
        <li v-for="item in SETTINGS_ITEMS" :key="item">
          <button class="play-panel__menu-item" type="button" disabled>
            {{ t(`playPanel.${item}`) }}
            <span class="play-panel__soon">{{ t('playPanel.soon') }}</span>
          </button>
        </li>
      </ul>
    </div>
    <p class="play-panel__status" role="status">{{ copyMessage }}</p>

    <fieldset class="play-panel__styles">
      <legend class="play-panel__legend">{{ t('playPanel.style') }}</legend>
      <label v-for="style in styles" :key="style.key" class="play-panel__style">
        <input
          class="play-panel__style-input"
          type="radio"
          name="play-style"
          :value="style.key"
          :checked="introTheme === style.key"
          @change="introTheme = style.key"
        >
        <span class="play-panel__style-card">
          <IntroThemePreview :tone="style.tone" />
          <span class="play-panel__style-name">{{ t(style.nameKey) }}</span>
        </span>
      </label>
    </fieldset>

    <AppDialog v-model:open="isLoginOpen" :title="t('playPanel.login.title')">
      <p class="play-panel__dialog-text">{{ t('playPanel.login.text') }}</p>
      <template #actions>
        <AppButton :to="loginHref">{{ t('playPanel.login.login') }}</AppButton>
        <AppButton color="blue" :to="localePath(AUTH_PATHS.register)">{{ t('playPanel.login.register') }}</AppButton>
        <button class="play-panel__dialog-close" type="button" @click="isLoginOpen = false">{{ t('playPanel.login.close') }}</button>
      </template>
    </AppDialog>
  </section>
</template>

<script setup lang="ts">
import { INTRO_THEME_KEYS, type IntroThemeKey } from '@nataskium/shared/schemas'
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { navigateTo, useI18n, useLocalePath, useRoute, useRouter } from '#imports'
import { restoreSession, useAuthStore } from '@/features/auth'
import { IntroThemePreview, findTheme } from '@/entities/intro-theme'
import { playUrl } from '@/entities/quiz'
import { AppButton, AppDialog, AUTH_PATHS, TEACHER_PATHS } from '@/shared'

const COPY_STATUS_MS = 2500
const SETTINGS_ITEMS = ['embed', 'qr'] as const
// Та же шестерёнка, что у вкладки «Настройки» в кабинете учителя
const GEAR_ICON =
  'M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2ZM15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z'

const props = defineProps<{
  title: string
  token: string
}>()

const introTheme = defineModel<IntroThemeKey>('introTheme', { required: true })

const { t } = useI18n()
const localePath = useLocalePath()
const route = useRoute()
const router = useRouter()
const auth = useAuthStore()

const styles = INTRO_THEME_KEYS.map((key) => findTheme(key))
const isSettingsOpen = ref(false)
const isLoginOpen = ref(false)
const copyMessage = ref('')
let resetTimer: ReturnType<typeof setTimeout> | undefined
// Гость без признака входа запрос не шлёт: restoreSession сразу считает его гостем
let sessionCheck: Promise<void> = Promise.resolve()

const loginHref = computed(() => router.resolve({ path: localePath(AUTH_PATHS.login), query: { next: route.fullPath } }).href)

onMounted(() => {
  sessionCheck = restoreSession()
})

async function createActivity(): Promise<void> {
  await sessionCheck
  if (!auth.isAuthenticated) {
    isLoginOpen.value = true
    return
  }
  await navigateTo(localePath(TEACHER_PATHS.create))
}

async function copyLink(): Promise<void> {
  try {
    await navigator.clipboard.writeText(playUrl(props.token))
    copyMessage.value = t('playPanel.linkCopied')
  } catch {
    copyMessage.value = t('playPanel.copyFailed')
  }
  clearTimeout(resetTimer)
  resetTimer = setTimeout(() => {
    copyMessage.value = ''
  }, COPY_STATUS_MS)
}

onBeforeUnmount(() => clearTimeout(resetTimer))
</script>

<style scoped lang="scss">
@use '@/assets/styles/breakpoints.module' as *;

// Телефон: название и шестерёнка в одной строке, кнопки под ними.
// Планшет и шире: название слева, кнопки и шестерёнка справа в одной строке
.play-panel {
  display: grid;
  grid-template-areas:
    'title settings'
    'actions actions'
    'status status'
    'styles styles';
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  gap: 14px 10px;
  padding: 20px var(--gutter) 32px;

  @include tablet {
    grid-template-areas:
      'title actions settings'
      'status status status'
      'styles styles styles';
    grid-template-columns: minmax(0, 1fr) auto auto;
    width: min(100% - 32px, 960px);
    margin: 0 auto;
    padding: 4px 0 40px;
  }

  @include desktop {
    width: min(100% - 160px, 1200px);
  }
}

.play-panel__title {
  grid-area: title;
  margin: 0;
  font-family: var(--font-display);
  font-size: 22px;
  font-weight: 700;
  line-height: 1.25;
  overflow-wrap: break-word;

  @include tablet {
    padding-inline-end: 14px;
    font-size: 26px;
  }
}

.play-panel__actions {
  grid-area: actions;
  display: flex;
  flex-wrap: wrap;
  align-items: flex-start;
  gap: 10px;

  @include tablet {
    justify-content: flex-end;
  }
}

.play-panel__button {
  min-height: 48px;
  padding: 8px 18px;
  border: 2px solid var(--color-blue);
  border-radius: 999px;
  background: var(--color-white);
  color: var(--color-blue-dark);
  font: inherit;
  font-weight: 700;
  line-height: 1.2;
  cursor: pointer;
  transition: background-color 0.2s ease;

  @media (hover: hover) {
    &:hover {
      background: rgb(var(--rgb-blue) / 0.08);
    }
  }

  &:focus-visible {
    outline: 3px solid var(--focus-color);
    outline-offset: 2px;
  }

  &[aria-expanded='true'] {
    background: rgb(var(--rgb-blue) / 0.12);
  }

  &--icon {
    display: grid;
    place-items: center;
    width: 48px;
    padding: 0;
  }

  &--create {
    padding-inline: 28px;
    border-color: var(--color-orange);
    background: var(--color-orange);
    color: var(--color-white);

    @media (hover: hover) {
      &:hover {
        background: var(--color-orange-dark);
      }
    }
  }
}

.play-panel__settings {
  grid-area: settings;
  position: relative;
}

.play-panel__icon {
  width: 24px;
  height: 24px;
  fill: none;
  stroke: currentColor;
  stroke-width: 2;
  stroke-linecap: round;
  stroke-linejoin: round;
}

// Меню поверх страницы, от правого края шестерёнки: в потоке оно раздвигало бы ряд кнопок
.play-panel__menu {
  position: absolute;
  top: 100%;
  right: 0;
  z-index: 1;
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 220px;
  margin: 8px 0 0;
  padding: 6px;
  border: 2px solid rgb(var(--rgb-blue) / 0.25);
  border-radius: 18px;
  background: var(--color-white);
  box-shadow: 0 10px 24px rgb(var(--rgb-night) / 0.16);
  list-style: none;
}

.play-panel__menu-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  width: 100%;
  min-height: 44px;
  padding: 6px 12px;
  border: 0;
  border-radius: 12px;
  background: none;
  color: var(--color-text-muted);
  font: inherit;
  font-weight: 600;
  text-align: start;
  cursor: not-allowed;
}

.play-panel__soon {
  padding: 2px 8px;
  border-radius: 999px;
  background: rgb(var(--rgb-blue) / 0.1);
  color: var(--color-blue-dark);
  font-size: 12px;
  font-weight: 700;
}

.play-panel__status {
  grid-area: status;
  min-height: 1.4em;
  margin: -6px 0 0;
  color: var(--color-text-muted);
  font-size: 14px;
}

.play-panel__styles {
  grid-area: styles;
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  min-width: 0;
  margin: 0;
  padding: 0;
  border: 0;
}

.play-panel__legend {
  margin-bottom: 8px;
  padding: 0;
  font-size: 17px;
  font-weight: 700;
}

.play-panel__style {
  position: relative;
  display: flex;
}

// Радиокнопка остаётся ради клавиатуры и скринридера, видна карточка
.play-panel__style-input {
  position: absolute;
  inset: 0;
  margin: 0;
  opacity: 0;
  cursor: pointer;
}

// Плитка: превью стиля и название под ним
.play-panel__style-card {
  display: flex;
  flex-direction: column;
  gap: 8px;
  width: 150px;
  padding: 6px 6px 10px;
  border: 2px solid rgb(var(--rgb-blue) / 0.3);
  border-radius: 16px;
  background: var(--color-white);
  color: var(--color-blue-dark);
  font-weight: 700;

  .play-panel__style-input:checked + & {
    border-color: var(--color-blue-dark);
    box-shadow: inset 0 0 0 2px var(--color-blue-dark);
    color: var(--color-text);
  }

  .play-panel__style-input:focus-visible + & {
    outline: 3px solid var(--focus-color);
    outline-offset: 2px;
  }
}

.play-panel__style-name {
  font-size: 15px;
  line-height: 1.2;
  text-align: center;
}

.play-panel__dialog-text {
  margin: 0;
  line-height: 1.45;
}

.play-panel__dialog-close {
  min-height: 44px;
  padding: 0 14px;
  border: 0;
  border-radius: 999px;
  background: transparent;
  color: var(--color-blue-dark);
  font: inherit;
  font-weight: 700;
  cursor: pointer;
}

@media (prefers-reduced-motion: reduce) {
  .play-panel__button {
    transition: none;
  }
}
</style>
