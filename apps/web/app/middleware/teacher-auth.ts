import { restoreSession, useAuthStore } from '@/features/auth'
import { AUTH_PATHS } from '@/shared'

// Кабинет — только для вошедшего учителя. Здесь только навигация: данные защищает API (Bearer в каждом запросе).
// Страницы /teacher/** рендерятся только в браузере (routeRules): токен и refresh-cookie есть только там
export default defineNuxtRouteMiddleware(async (to) => {
  if (import.meta.server) return
  // Composables (store, i18n) — до первого await: после него контекста Nuxt уже нет
  const auth = useAuthStore()
  const loginPath = useLocalePath()(AUTH_PATHS.login)
  await restoreSession()
  if (auth.isAuthenticated) return
  // next проверит safeNextPath на странице входа: только путь этого сайта
  return navigateTo({ path: loginPath, query: { next: to.fullPath } })
})
