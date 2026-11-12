<template>
  <details ref="root" class="language-switcher">
    <summary class="language-switcher__trigger" :aria-label="t('language.switcherLabel')">
      <span class="language-switcher__label">{{ t('language.label') }}</span>
      <span class="language-switcher__current" :lang="locale">
        <span aria-hidden="true">{{ currentLanguage.flag }}</span>
        {{ currentLanguage.name }}
      </span>
    </summary>
    <ul class="language-switcher__menu" :aria-label="t('language.switcherLabel')">
      <li v-for="item in languages" :key="item.code">
        <NuxtLink
          v-if="item.isAvailable"
          class="language-switcher__link"
          :class="{ 'language-switcher__link--current': item.code === locale }"
          :to="switchLocalePath(item.code as Locale)"
          :lang="item.code"
          :hreflang="item.code"
          :aria-current="item.code === locale ? 'true' : undefined"
          @click="closeMenu"
        >
          <span aria-hidden="true">{{ item.flag }}</span>
          {{ item.name }}
          <span v-if="item.code === locale" class="language-switcher__check" aria-hidden="true">✓</span>
        </NuxtLink>
        <span v-else class="language-switcher__link language-switcher__link--unavailable" :lang="item.code" aria-disabled="true">
          <span aria-hidden="true">{{ item.flag }}</span>
          {{ item.name }}
          <span class="language-switcher__soon">{{ t('language.comingSoon') }}</span>
        </span>
      </li>
    </ul>
  </details>
</template>

<script setup lang="ts">
import { computed, useTemplateRef } from 'vue'
import { NuxtLink } from '#components'
import { useI18n, useSwitchLocalePath } from '#imports'
import type { Locale } from '@nataskium/shared/locales'

const { locale, locales, t } = useI18n()
const switchLocalePath = useSwitchLocalePath()
const root = useTemplateRef<HTMLDetailsElement>('root')

// Названия — на самих языках, чтобы человек мог найти свой до смены интерфейса.
// Готовые языки (название и флаг) — из настроек i18n в nuxt.config.ts. Здесь только те, чей перевод ещё не готов:
// они видны в списке, но их нельзя выбрать. Язык стал готов — убрать его отсюда
const UPCOMING_LANGUAGES = [
  { code: 'uk', name: 'Українська', flag: '🇺🇦' },
  { code: 'es', name: 'Español', flag: '🇪🇸' },
  { code: 'it', name: 'Italiano', flag: '🇮🇹' },
  { code: 'pl', name: 'Polski', flag: '🇵🇱' },
  { code: 'nl', name: 'Nederlands', flag: '🇳🇱' },
  { code: 'zh', name: '中文', flag: '🇨🇳' },
] as const
const FALLBACK_FLAG = '🌐'

const languages = computed(() => {
  const available = locales.value.map(({ code, name, flag }) => ({
    code,
    name: name ?? code,
    flag: typeof flag === 'string' ? flag : FALLBACK_FLAG,
    isAvailable: true,
  }))
  return [...available, ...UPCOMING_LANGUAGES.map((item) => ({ ...item, isAvailable: false }))]
})
const currentLanguage = computed(
  () => languages.value.find(({ code }) => code === locale.value) ?? { code: locale.value, name: locale.value, flag: FALLBACK_FLAG, isAvailable: true },
)

function closeMenu() {
  root.value?.removeAttribute('open')
}
</script>

<style scoped lang="scss">
.language-switcher {
  position: relative;
  width: fit-content;
  max-width: 100%;
}

.language-switcher__trigger {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
  min-height: 44px;
  padding: 6px 10px;
  border-radius: 12px;
  cursor: pointer;
  font-weight: 500;
  list-style: none;
  transition: background-color 0.2s ease;

  &::-webkit-details-marker { display: none; }

  &::after {
    content: '';
    width: 7px;
    height: 7px;
    margin: 0 4px 3px 2px;
    border-right: 2px solid currentcolor;
    border-bottom: 2px solid currentcolor;
    transform: rotate(45deg);
    transition: transform 0.2s ease;
  }

  &:hover { background: rgb(var(--rgb-blue) / 0.13); }
}

.language-switcher[open] .language-switcher__trigger {
  background: rgb(var(--rgb-blue) / 0.13);

  &::after {
    margin-bottom: -2px;
    transform: rotate(225deg);
  }
}

.language-switcher__label { font-weight: 400; }

.language-switcher__current {
  display: flex;
  align-items: center;
  gap: 6px;
  white-space: nowrap;
}

.language-switcher__menu {
  position: absolute;
  z-index: var(--z-language-menu);
  bottom: calc(100% + 6px);
  left: 0;
  display: grid;
  min-width: max-content;
  max-width: min(280px, calc(100vw - 2 * var(--gutter)));
  max-height: min(360px, 60vh);
  margin: 0;
  padding: 6px;
  overflow-y: auto;
  border: 1px solid rgb(var(--rgb-text) / 0.12);
  border-radius: 14px;
  background: var(--color-white);
  box-shadow: 0 12px 28px rgb(20 32 49 / 0.18);
  list-style: none;
}

.language-switcher__link {
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: 40px;
  padding: 8px 10px;
  border-radius: 9px;
  color: var(--color-text);
  font-weight: 500;
  line-height: 1.25;
  text-decoration: none;

  &:hover { background: rgb(var(--rgb-blue) / 0.13); }
}

.language-switcher__link--current {
  background: rgb(var(--rgb-blue) / 0.1);
  font-weight: 700;
}

.language-switcher__link--unavailable {
  color: rgb(var(--rgb-text) / 0.52);
  cursor: not-allowed;
}

.language-switcher__soon {
  margin-left: auto;
  color: inherit;
  font-size: 12px;
  font-weight: 400;
}

.language-switcher__check {
  margin-left: auto;
  color: var(--color-blue);
}

</style>
