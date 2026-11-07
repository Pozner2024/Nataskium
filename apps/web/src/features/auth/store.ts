import type { AuthSessionResponse, TeacherView } from '@nataskium/shared/schemas'
import { defineStore } from 'pinia'
import { computed, ref } from 'vue'

export type SessionStatus = 'unknown' | 'authenticated' | 'anonymous'

// Access-токен — только в памяти: не в localStorage, sessionStorage и cookie. После перезагрузки страницы
// сессия восстанавливается через refresh (httpOnly cookie)
export const useAuthStore = defineStore('auth', () => {
  const accessToken = ref<string | null>(null)
  const teacher = ref<TeacherView | null>(null)
  const status = ref<SessionStatus>('unknown')
  // Растёт при каждой смене сессии, в том числе из другой вкладки: ждущий refresh видит, что токен уже обновили
  const sessionVersion = ref(0)

  const isAuthenticated = computed(() => status.value === 'authenticated')

  function setSession(session: AuthSessionResponse): void {
    accessToken.value = session.accessToken
    teacher.value = session.teacher
    status.value = 'authenticated'
    sessionVersion.value++
  }

  function clearSession(): void {
    accessToken.value = null
    teacher.value = null
    status.value = 'anonymous'
    sessionVersion.value++
  }

  return { accessToken, teacher, status, sessionVersion, isAuthenticated, setSession, clearSession }
})
