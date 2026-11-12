import { SITE_NAME } from '../config'
import { useHead } from '#imports'

// «Страница — Nataskium»; у страницы без своего title — только название сайта. Вызывается и в app.vue, и в error.vue:
// при ошибке Nuxt рисует error.vue вместо app.vue
export function useSiteTitle(): void {
  useHead({
    titleTemplate: (title) => (title === undefined || title === '' || title === SITE_NAME ? SITE_NAME : `${title} — ${SITE_NAME}`),
  })
}
