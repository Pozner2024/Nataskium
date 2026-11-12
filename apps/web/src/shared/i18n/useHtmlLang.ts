import { useHead, useI18n } from '#imports'

// Скринридеры и браузерный перевод выбирают язык по атрибуту. Вызывается и в app.vue, и в error.vue:
// при ошибке Nuxt рисует error.vue вместо app.vue
export function useHtmlLang(): void {
  const { locale } = useI18n()
  useHead(() => ({ htmlAttrs: { lang: locale.value } }))
}
