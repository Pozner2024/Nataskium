import { fileURLToPath } from 'node:url'

// Служебная страница для просмотра Натов — только в режиме разработки
const DEV_ONLY_PATHS = ['/nat']

export default defineNuxtConfig({
  compatibilityDate: '2026-10-20',
  modules: ['@nuxt/fonts', '@nuxt/eslint'],
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
  app: {
    head: {
      title: 'Nataskium',
      htmlAttrs: { lang: 'ru' },
    },
  },
})
