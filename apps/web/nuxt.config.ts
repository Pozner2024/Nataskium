import { fileURLToPath } from 'node:url'

export default defineNuxtConfig({
  compatibilityDate: '2026-10-20',
  modules: ['@nuxt/fonts'],
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
  typescript: {
    tsConfig: {
      include: ['../src/**/*'],
    },
  },
  app: {
    head: {
      title: 'Nataskium',
      htmlAttrs: { lang: 'ru' },
    },
  },
})
