import { restoreSession, safeNextPath, useAuthStore } from '@/features/auth'
import { useUnroutedPath } from '@/shared'

// Вход и регистрация не нужны вошедшему учителю: сразу туда, куда вёл бы вход (по умолчанию — кабинет)
export default defineNuxtRouteMiddleware(async (to) => {
  if (import.meta.server) return
  // Composables (store, i18n) — до первого await: после него контекста Nuxt уже нет
  const auth = useAuthStore()
  const unroutedPath = useUnroutedPath()
  await restoreSession()
  if (!auth.isAuthenticated) return
  return navigateTo(unroutedPath(safeNextPath(to.query.next)))
})
