import { fileURLToPath } from 'node:url'

const DEV_ONLY_PATHS = ['/nat', '/auth-card-preview']
// Порт API в dev (API_PORT по умолчанию в apps/api)
const DEV_API_PORT = 3001

export default defineNuxtConfig({
  compatibilityDate: '2026-10-20',
  modules: ['@nuxt/fonts', '@nuxt/eslint', '@pinia/nuxt'],
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
  // Страницы входа — только в браузере: токены из ссылок не попадают в HTML и кэш
  routeRules: {
    '/auth/**': { ssr: false },
  },
  nitro: {
    // Только nuxt dev: фронт ходит на относительный /api, запросы same-origin, и cookie с Path=/api/auth уходит.
    // В production /api отдаёт Caddy, в сборку это не попадает
    devProxy: {
      '/api': { target: `http://127.0.0.1:${DEV_API_PORT}/api`, changeOrigin: true },
    },
  },
  app: {
    head: {
      title: 'Nataskium',
      htmlAttrs: { lang: 'ru' },
    },
  },
})
