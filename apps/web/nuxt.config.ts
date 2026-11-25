import { fileURLToPath } from 'node:url'
import { DEFAULT_LOCALE, type Locale, SUPPORTED_LOCALES } from '@nataskium/shared/locales'
import { SITE_NAME } from './src/shared/config/siteName'

// Список языков — в @nataskium/shared: его же использует API для писем. Здесь только подписи, флаги и файлы переводов;
// Record<Locale, …> не даст добавить язык в общий список и забыть про них
const LOCALE_META: Record<Locale, { language: string; name: string; flag: string; file: string }> = {
  ru: { language: 'ru-RU', name: 'Русский', flag: '🇷🇺', file: 'ru.ts' },
  en: { language: 'en-US', name: 'English', flag: '🇬🇧', file: 'en.ts' },
  de: { language: 'de-DE', name: 'Deutsch', flag: '🇩🇪', file: 'de.ts' },
  fr: { language: 'fr-FR', name: 'Français', flag: '🇫🇷', file: 'fr.ts' },
}
const LOCALES = SUPPORTED_LOCALES.map((code) => ({ code, ...LOCALE_META[code] }))
const PREFIXES = ['', ...LOCALES.filter(({ code }) => code !== DEFAULT_LOCALE).map(({ code }) => `/${code}`)]
// Приватные страницы у каждого языка свои: /auth/**, /en/auth/**. Кабинет учителя — тоже только в браузере:
// его данные доступны лишь с access-токеном, который живёт в памяти вкладки.
// Игра ученика — тоже: язык выбирается по navigator.languages, на сервере его нет
// Библиотека — пока тоже (ADR-0007): серверная отрисовка с запросами к API отложена
const CLIENT_ONLY_PATHS = ['/auth/**', '/teacher', '/teacher/**', '/play/**', '/library', '/library/**']

const DEV_ONLY_PATHS = ['/nat', '/auth-card-preview', '/teacher-preview', '/intro-preview']
// Порт API в dev (API_PORT по умолчанию в apps/api)
const DEV_API_PORT = 3001

export default defineNuxtConfig({
  compatibilityDate: '2026-10-20',
  modules: ['@nuxt/fonts', '@nuxt/eslint', '@pinia/nuxt', '@nuxtjs/i18n'],
  fonts: {
    families: [
      { name: 'Unbounded', provider: 'google', weights: [500, 700] },
      { name: 'Onest', provider: 'google', weights: [400, 500, 700] },
    ],
  },
  alias: {
    '@': fileURLToPath(new URL('./src', import.meta.url)),
  },
  css: ['@/assets/styles/global.scss'],
  i18n: {
    // Файлы переводов — в shared ФСД, а не в корне проекта
    restructureDir: 'src/shared/i18n',
    langDir: 'locales',
    defaultLocale: DEFAULT_LOCALE,
    // Русский на /, остальные языки с префиксом: /en, /en/library. Свой адрес у каждого языка нужен поисковикам
    strategy: 'prefix_except_default',
    locales: LOCALES,
    detectBrowserLanguage: {
      useCookie: true,
      cookieKey: 'nataskium-locale',
      // Только заход на корень: остальные адреса уже говорят, какой язык нужен
      redirectOn: 'root',
      fallbackLocale: DEFAULT_LOCALE,
    },
  },
  hooks: {
    'pages:extend'(pages) {
      if (process.env.NODE_ENV !== 'production') return
      for (const path of DEV_ONLY_PATHS) {
        const index = pages.findIndex((page) => page.path === path)
        if (index !== -1) pages.splice(index, 1)
      }
    },
  },
  typescript: {
    tsConfig: {
      // E2E здесь, а не в nodeTsConfig: колбэки page.evaluate выполняются в браузере и работают с window
      include: ['../src/**/*', '../tests/e2e/**/*'],
    },
    nodeTsConfig: {
      include: ['../playwright.config.ts', '../vitest.config.ts'],
    },
  },
  // Страницы входа — только в браузере: токены из ссылок не попадают в HTML и кэш
  routeRules: Object.fromEntries(
    PREFIXES.flatMap((prefix) => CLIENT_ONLY_PATHS.map((path) => [`${prefix}${path}`, { ssr: false }] as const)),
  ),
  nitro: {
    // Только nuxt dev: фронт ходит на относительный /api, запросы same-origin, и cookie с Path=/api/auth уходит.
    // В production /api отдаёт Caddy, в сборку это не попадает
    devProxy: {
      '/api': { target: `http://127.0.0.1:${DEV_API_PORT}/api`, changeOrigin: true },
    },
  },
  app: {
    head: {
      // Шаблон «Страница — Nataskium» — в useSiteTitle (src/shared/lib); здесь title для HTML-оболочки страниц /auth/**
      title: SITE_NAME,
      // Буква «а» из логотипа с Натом; PNG — для браузеров без SVG-иконок и для экрана «Домой» на iPhone.
      // ?v= — сменить при новой иконке: браузеры (особенно Firefox) держат иконку в своём кэше
      link: [
        { rel: 'icon', type: 'image/svg+xml', href: '/favicon.svg?v=3' },
        { rel: 'icon', type: 'image/png', sizes: '32x32', href: '/favicon-32.png?v=3' },
        { rel: 'apple-touch-icon', sizes: '180x180', href: '/apple-touch-icon.png?v=3' },
      ],
    },
  },
})
