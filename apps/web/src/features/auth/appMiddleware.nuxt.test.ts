import { beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'
import { useNuxtApp, useRouter } from '#imports'
import { authApi, useAuthStore } from '@/features/auth'
import guestOnly from '../../../app/middleware/guest-only'
import teacherAuth from '../../../app/middleware/teacher-auth'

const SIGNED_IN_HINT_KEY = 'nataskium-signed-in'
const SESSION = {
  accessToken: 'access-1',
  teacher: {
    id: '6f1c2a4e-8d3b-4f5a-9c7e-1b2d3e4f5a6b',
    email: 'qa-anna@example.test',
    displayName: 'Анна',
    hasPassword: true,
    hasGoogle: false,
  },
}

// Шпион ставится до первого useSessionSync: экземпляр на вкладку запоминает функцию refresh
const refresh = vi.spyOn(authApi, 'refresh')

// Маршрут для middleware: путь, полный адрес и query, как их отдаёт роутер
function route(fullPath: string, query: Record<string, unknown> = {}) {
  return { path: fullPath.split('?')[0], fullPath, query } as never
}

// Middleware Nuxt вызывает внутри контекста приложения: useI18n в guest-only работает только там
function runMiddleware(middleware: typeof guestOnly, to: ReturnType<typeof route>, from: ReturnType<typeof route>) {
  return useNuxtApp().runWithContext(() => middleware(to, from))
}

// Навигация из middleware идёт через роутер асинхронно: ждём, пока он осядет
async function currentPath(): Promise<string> {
  await useRouter().isReady()
  await new Promise((resolve) => setTimeout(resolve, 0))
  return useRouter().currentRoute.value.fullPath
}

// Сессия «уже известна» — restoreSession её не трогает и refresh не шлёт
function signIn() {
  useAuthStore().setSession(SESSION)
}

beforeEach(async () => {
  refresh.mockReset()
  localStorage.clear()
  useAuthStore().$patch({ accessToken: null, teacher: null, status: 'unknown' })
  await useNuxtApp().$i18n.setLocale('ru')
  await useRouter().push('/')
  await nextTick()
})

describe('teacher-auth: кабинет только для вошедшего', () => {
  it('без сессии уводит на вход и помнит, куда вести дальше', async () => {
    await runMiddleware(teacherAuth as typeof guestOnly, route('/teacher/settings'), route('/'))

    expect(await currentPath()).toBe('/auth/login?next=/teacher/settings')
  })

  it('без сессии на английской версии — вход на английском, next с префиксом языка', async () => {
    await useNuxtApp().$i18n.setLocale('en')

    await runMiddleware(teacherAuth as typeof guestOnly, route('/en/teacher'), route('/en'))

    expect(await currentPath()).toBe('/en/auth/login?next=/en/teacher')
  })

  it('с сессией остаётся на месте', async () => {
    signIn()

    await runMiddleware(teacherAuth as typeof guestOnly, route('/teacher'), route('/'))

    expect(await currentPath()).toBe('/')
  })

  it('сессия восстанавливается через refresh, если признак входа есть', async () => {
    localStorage.setItem(SIGNED_IN_HINT_KEY, '1')
    refresh.mockResolvedValue(SESSION)

    await runMiddleware(teacherAuth as typeof guestOnly, route('/teacher'), route('/'))

    expect(refresh).toHaveBeenCalledTimes(1)
    expect(await currentPath()).toBe('/')
  })
})

describe('guest-only: вход и регистрация не нужны вошедшему', () => {
  it('без сессии страница входа остаётся', async () => {
    await useRouter().push('/auth/login')

    await runMiddleware(guestOnly, route('/auth/login'), route('/'))

    expect(await currentPath()).toBe('/auth/login')
  })

  it('с сессией и без next — в кабинет', async () => {
    signIn()
    await useRouter().push('/auth/login')

    await runMiddleware(guestOnly, route('/auth/login'), route('/'))

    expect(await currentPath()).toBe('/teacher')
  })

  it.each([
    ['/teacher/settings', '/teacher/settings'],
    ['/teacher?tab=drafts', '/teacher?tab=drafts'],
  ])('с сессией и next=%s — туда', async (next, expected) => {
    signIn()
    await useRouter().push('/auth/login')

    await runMiddleware(guestOnly, route('/auth/login', { next }), route('/'))

    expect(await currentPath()).toBe(expected)
  })

  it('на английской версии next с /en остаётся на английской версии', async () => {
    signIn()
    await useNuxtApp().$i18n.setLocale('en')
    await useRouter().push('/en/auth/login')

    await runMiddleware(guestOnly, route('/en/auth/login', { next: '/en/teacher/settings' }), route('/en'))

    expect(await currentPath()).toBe('/en/teacher/settings')
  })

  it.each(['/de/teacher', '/fr/teacher'])('next с префиксом языка %s — путь этого сайта, не уходит на чужой адрес', async (next) => {
    signIn()
    await useRouter().push('/auth/login')

    await runMiddleware(guestOnly, route('/auth/login', { next }), route('/'))

    expect(await currentPath()).toBe(next)
  })

  // Открытый редирект: next должен остаться путём этого сайта, иначе вход уведёт учителя на чужой адрес
  it.each([
    ['протокол-относительный', '//evil.example'],
    ['протокол-относительный с путём', '//evil.example/teacher'],
    ['https', 'https://evil.example'],
    ['обратный слэш', '/\\evil.example'],
    ['табуляция перед обратным слэшем', '/\t\\evil.example'],
  ])('с сессией и next (%s) — в кабинет, чужой адрес не открывается', async (_name, next) => {
    signIn()
    await useRouter().push('/auth/login')

    await runMiddleware(guestOnly, route('/auth/login', { next }), route('/'))

    expect(await currentPath()).toBe('/teacher')
  })

  it('на английской версии с чужим next — в английский кабинет', async () => {
    signIn()
    await useNuxtApp().$i18n.setLocale('en')
    await useRouter().push('/en/auth/login')

    await runMiddleware(guestOnly, route('/en/auth/login', { next: '//evil.example' }), route('/en'))

    expect(await currentPath()).toBe('/en/teacher')
  })
})
