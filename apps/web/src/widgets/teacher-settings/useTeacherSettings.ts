import { changePasswordSchema, deleteAccountSchema, googleReauthStartSchema } from '@nataskium/shared/schemas'
import { computed, ref, watch } from 'vue'
import { authApi, authorizedRequest, logout, useAuthForm, useSessionSync } from '@/features/auth'
import type { ChangePasswordPayload } from '@/features/change-password'
import { ApiError, NETWORK_ERROR_STATUS, useCurrentLocale } from '@/shared'

const GOOGLE_ACCOUNTS_ORIGIN = 'https://accounts.google.com'

// Действия страницы настроек. Сессия заканчивается (выход, удаление) — уход из кабинета делает layout teacher.
// useSessionSync — только в обработчиках: он работает лишь в браузере
export function useTeacherSettings() {
  const locale = useCurrentLocale()

  const passwordForm = useAuthForm('changePassword')
  const isPasswordChanged = ref(false)

  async function changePassword(payload: ChangePasswordPayload): Promise<void> {
    isPasswordChanged.value = false
    // locale — язык письма «пароль изменён»
    await passwordForm.submit(changePasswordSchema, payload, { ...payload, locale: locale.value }, async (input) => {
      const session = await authorizedRequest((accessToken) => authApi.changePassword(input, accessToken))
      // Сервер удалил остальные сессии и выдал новую: вкладки этого браузера получают её
      useSessionSync().publishSession(session)
      isPasswordChanged.value = true
    })
  }

  const deleteForm = useAuthForm('deleteAccount')
  const isDeleteOpen = ref(false)
  const deleteError = computed(() => deleteForm.formError.value ?? deleteForm.fieldErrors.value.password)

  async function deleteAccount(password: string): Promise<void> {
    const values = { password }
    // locale — язык письма «Аккаунт удалён»
    await deleteForm.submit(deleteAccountSchema, values, { ...values, locale: locale.value }, async (input) => {
      await authorizedRequest((accessToken) => authApi.deleteAccount(input, accessToken))
      isDeleteOpen.value = false
      // Сервер уже удалил аккаунт, сессии и refresh-cookie: очищаем сессию здесь и в других вкладках
      useSessionSync().publishLogout()
    })
  }

  // Аккаунт без пароля: «Вы уверены?» уже позади (диалог). Дальше вход в Google — и API сразу удаляет аккаунт,
  // итог показывает страница /auth/account-deleted. locale — язык этой страницы и письма об удалении
  async function deleteAccountWithGoogle(): Promise<void> {
    const payload = { locale: locale.value }
    await deleteForm.submit(googleReauthStartSchema, {}, payload, async (input) => {
      const url = await authorizedRequest((accessToken) => authApi.googleReauthStart(input, accessToken))
      // Адрес пришёл от нашего API, но уходить разрешено только на Google: никакой ответ не уведёт на чужой сайт
      if (new URL(url).origin !== GOOGLE_ACCOUNTS_ORIGIN) throw new ApiError(NETWORK_ERROR_STATUS)
      window.location.assign(url)
    })
  }

  // Повторное открытие диалога — без ошибки прошлой попытки
  watch(isDeleteOpen, (isOpen) => {
    if (!isOpen) deleteForm.clearErrors()
  })

  return {
    isPasswordLoading: passwordForm.isLoading,
    passwordError: passwordForm.formError,
    passwordFieldErrors: passwordForm.fieldErrors,
    isPasswordChanged,
    changePassword,
    isDeleteOpen,
    isDeleteLoading: deleteForm.isLoading,
    deleteError,
    deleteAccount,
    deleteAccountWithGoogle,
    logout,
  }
}
