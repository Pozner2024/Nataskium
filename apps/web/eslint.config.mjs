// Базовый конфиг генерирует модуль @nuxt/eslint в .nuxt (nuxt prepare / nuxt dev)
import withNuxt from './.nuxt/eslint.config.mjs'

export default withNuxt({
  rules: {
    // ФСД: импорт слайса только через его index.ts, без заглядывания внутрь
    'no-restricted-imports': ['error', {
      patterns: [{
        group: ['@/widgets/*/*', '@/features/*/*', '@/entities/*/*', '@/shared/*'],
        message: 'Импортируйте через index.ts слайса: @/widgets/<slice>, @/shared и т.д.',
      }],
    }],
  },
})
