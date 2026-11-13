import { mountSuspended } from '@nuxt/test-utils/runtime'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, nextTick } from 'vue'
import { ApiError } from '@/shared'
import { authApi, useAuthStore } from '@/features/auth'
import { useTeacherSettings } from './useTeacherSettings'

const TEACHER = {
  id: '6f1c2a4e-8d3b-4f5a-9c7e-1b2d3e4f5a6b',
  email: 'qa-anna@example.test',
  displayName: 'Анна',
  hasPassword: true,
  hasGoogle: false,
}
const CHANGE = { currentPassword: 'qa-correct-horse', newPassword: 'qa-correct-horse-1957' }
const NEW_SESSION = { accessToken: 'access-2', teacher: TEACHER }

// useI18n работает только внутри setup: композабл вызывается из компонента-обёртки
async function useSettings(): Promise<ReturnType<typeof useTeacherSettings>> {
  let settings: ReturnType<typeof useTeacherSettings> | undefined
  await mountSuspended(defineComponent({
    setup() {
      settings = useTeacherSettings()
      return () => null
    },
  }))
  if (settings === undefined) throw new Error('useTeacherSettings не вызван')
  return settings
}

beforeEach(async () => {
  vi.restoreAllMocks()
  useAuthStore().$patch({ accessToken: null, teacher: null, status: 'unknown' })
  useAuthStore().setSession({ accessToken: 'access-1', teacher: TEACHER })
  await nextTick()
})

describe('смена пароля', () => {
  it('успех: новая сессия из ответа заменяет токен, форма показывает «готово»', async () => {
    const change = vi.spyOn(authApi, 'changePassword').mockResolvedValue(NEW_SESSION)
    const settings = await useSettings()

    await settings.changePassword(CHANGE)

    expect(change).toHaveBeenCalledWith(expect.objectContaining(CHANGE), 'access-1')
    expect(settings.isPasswordChanged.value).toBe(true)
    expect(settings.passwordError.value).toBeUndefined()
    expect(useAuthStore().accessToken).toBe('access-2')
  })

  it('неверный текущий пароль (400) — текст формы, без «готово»', async () => {
    vi.spyOn(authApi, 'changePassword').mockRejectedValue(new ApiError(400))
    const settings = await useSettings()

    await settings.changePassword(CHANGE)

    expect(settings.passwordError.value).toBe('Неверный текущий пароль')
    expect(settings.isPasswordChanged.value).toBe(false)
    expect(useAuthStore().accessToken).toBe('access-1')
  })

  it('429 — время ожидания, пароль не меняется', async () => {
    vi.spyOn(authApi, 'changePassword').mockRejectedValue(new ApiError(429, [], 120))
    const settings = await useSettings()

    await settings.changePassword(CHANGE)

    expect(settings.passwordError.value).toBe('Слишком много попыток. Попробуйте через 2 мин.')
    expect(settings.isPasswordChanged.value).toBe(false)
  })

  it('повторная отправка после успеха сбрасывает «готово» до ответа сервера', async () => {
    vi.spyOn(authApi, 'changePassword').mockResolvedValueOnce(NEW_SESSION).mockRejectedValueOnce(new ApiError(400))
    const settings = await useSettings()
    await settings.changePassword(CHANGE)

    await settings.changePassword(CHANGE)

    expect(settings.isPasswordChanged.value).toBe(false)
    expect(settings.passwordError.value).toBe('Неверный текущий пароль')
  })
})

describe('удаление аккаунта по паролю', () => {
  it('неверный пароль (400) — «Неверный пароль», диалог открыт, сессия цела', async () => {
    vi.spyOn(authApi, 'deleteAccount').mockRejectedValue(new ApiError(400))
    const settings = await useSettings()
    settings.isDeleteOpen.value = true

    await settings.deleteAccount('qa-wrong-password')

    expect(settings.deleteError.value).toBe('Неверный пароль')
    expect(settings.isDeleteOpen.value).toBe(true)
    expect(useAuthStore().isAuthenticated).toBe(true)
  })

  it('успех: диалог закрыт, сессия очищена (выход)', async () => {
    const remove = vi.spyOn(authApi, 'deleteAccount').mockResolvedValue()
    const settings = await useSettings()
    settings.isDeleteOpen.value = true

    await settings.deleteAccount('qa-correct-horse')

    // locale — язык письма «Аккаунт удалён»: уходит вместе с паролем
    expect(remove).toHaveBeenCalledWith(expect.objectContaining({ password: 'qa-correct-horse', locale: 'ru' }), 'access-1')
    expect(settings.isDeleteOpen.value).toBe(false)
    expect(useAuthStore().status).toBe('anonymous')
    expect(useAuthStore().accessToken).toBeNull()
  })

  it('закрытие диалога убирает ошибку прошлой попытки', async () => {
    vi.spyOn(authApi, 'deleteAccount').mockRejectedValue(new ApiError(400))
    const settings = await useSettings()
    settings.isDeleteOpen.value = true
    await settings.deleteAccount('qa-wrong-password')

    settings.isDeleteOpen.value = false
    await nextTick()

    expect(settings.deleteError.value).toBeUndefined()
  })
})

describe('удаление аккаунта без пароля через Google', () => {
  const GOOGLE_URL = 'https://accounts.google.com/o/oauth2/v2/auth?client_id=qa&state=qa'

  // Переход на Google: адрес window.location подменяется, сама навигация в happy-dom не нужна
  function stubLocation() {
    return vi.spyOn(window.location, 'assign').mockImplementation(() => {})
  }

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('адрес Google из ответа API — переход на него, ошибки нет', async () => {
    const start = vi.spyOn(authApi, 'googleReauthStart').mockResolvedValue(GOOGLE_URL)
    const assign = stubLocation()
    const settings = await useSettings()

    await settings.deleteAccountWithGoogle()

    expect(start).toHaveBeenCalledWith(expect.objectContaining({ locale: 'ru' }), 'access-1')
    expect(assign).toHaveBeenCalledWith(GOOGLE_URL)
    expect(settings.deleteError.value).toBeUndefined()
  })

  it.each([
    ['чужой сайт', 'https://evil.example/o/oauth2/v2/auth'],
    ['поддомен-обманка', 'https://accounts.google.com.evil.example/'],
    ['http вместо https', 'http://accounts.google.com/o/oauth2/v2/auth'],
    ['javascript:', 'javascript:alert(1)'],
    ['не адрес', 'not a url'],
  ])('адрес из ответа (%s) — не переходим, показываем ошибку', async (_name, url) => {
    vi.spyOn(authApi, 'googleReauthStart').mockResolvedValue(url)
    const assign = stubLocation()
    const settings = await useSettings()

    await settings.deleteAccountWithGoogle()

    expect(assign).not.toHaveBeenCalled()
    expect(settings.deleteError.value).toBeTruthy()
  })

  it('сессия закончилась при запуске (401) — переход не делаем', async () => {
    vi.spyOn(authApi, 'googleReauthStart').mockRejectedValue(new ApiError(401))
    const assign = stubLocation()
    const settings = await useSettings()

    await settings.deleteAccountWithGoogle()

    expect(assign).not.toHaveBeenCalled()
    expect(settings.deleteError.value).toBeTruthy()
  })
})
