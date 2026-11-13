import { mountSuspended } from '@nuxt/test-utils/runtime'
import type { VueWrapper } from '@vue/test-utils'
import { flushPromises } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useAuthStore } from '@/features/auth'
import AccountDeletedPage from './AccountDeletedPage.vue'

// Страница итога удаления через Google: адрес с ?status или ?error, сессия — настоящая, fetch подменяется
const SESSION = {
  accessToken: 'access-1',
  teacher: {
    id: '6f1c2a4e-8d3b-4f5a-9c7e-1b2d3e4f5a6b',
    email: 'qa-anna@example.test',
    displayName: 'Анна',
    hasPassword: false,
    hasGoogle: true,
  },
}
const DELETED_TITLE = 'Аккаунт удалён'
const NOT_DELETED_TITLE = 'Аккаунт не удалён'
const WRONG_ACCOUNT = 'Этот аккаунт Google не привязан к вашему аккаунту Nataskium.'
const FAILED = 'Не удалось подтвердить вход через Google.'

let wrapper: VueWrapper | undefined
let refreshCalls: number
let respondToRefresh: () => Promise<Response>

beforeEach(() => {
  refreshCalls = 0
  respondToRefresh = () => Promise.resolve(new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 }))
  vi.stubGlobal('fetch', (url: string) => {
    if (url.endsWith('/api/auth/refresh')) {
      refreshCalls++
      return respondToRefresh()
    }
    return Promise.resolve(new Response(null, { status: 404 }))
  })
  useAuthStore().$patch({ accessToken: null, teacher: null, status: 'unknown' })
})

afterEach(() => {
  wrapper?.unmount()
  wrapper = undefined
  vi.unstubAllGlobals()
})

async function openPage(route: string) {
  wrapper = await mountSuspended(AccountDeletedPage, { route })
  await flushPromises()
  return wrapper
}

describe('страница итога удаления через Google', () => {
  it('?status=deleted без сессии — «аккаунт удалён», выхода лишнего нет', async () => {
    const page = await openPage('/auth/account-deleted?status=deleted')

    expect(page.text()).toContain(DELETED_TITLE)
    expect(refreshCalls).toBe(1)
    expect(useAuthStore().status).toBe('anonymous')
  })

  it('?status=deleted, а сессия жива (refresh прошёл) — «аккаунт не удалён», сессия не сбрасывается', async () => {
    respondToRefresh = () => Promise.resolve(new Response(JSON.stringify(SESSION), { status: 200 }))

    const page = await openPage('/auth/account-deleted?status=deleted')

    expect(page.text()).toContain(NOT_DELETED_TITLE)
    expect(page.text()).toContain(FAILED)
    expect(useAuthStore().isAuthenticated).toBe(true)
    expect(useAuthStore().accessToken).toBe('access-1')
  })

  it('?error=delete_has_password — «у аккаунта появился пароль», аккаунт не удалён', async () => {
    useAuthStore().setSession(SESSION)

    const page = await openPage('/auth/account-deleted?error=delete_has_password')

    expect(page.text()).toContain(NOT_DELETED_TITLE)
    expect(page.text()).toContain('У аккаунта появился пароль. Удалите аккаунт по паролю в настройках.')
    expect(refreshCalls).toBe(0)
    expect(useAuthStore().isAuthenticated).toBe(true)
  })

  it('?error=delete_wrong_account — текст ошибки, refresh не вызывается, сессия цела', async () => {
    useAuthStore().setSession(SESSION)

    const page = await openPage('/auth/account-deleted?error=delete_wrong_account')

    expect(page.text()).toContain(NOT_DELETED_TITLE)
    expect(page.text()).toContain(WRONG_ACCOUNT)
    expect(refreshCalls).toBe(0)
    expect(useAuthStore().isAuthenticated).toBe(true)
  })

  it('неизвестный код ошибки — общий текст, сам код на экран не выводится', async () => {
    const page = await openPage('/auth/account-deleted?error=%3Cscript%3Ealert(1)%3C%2Fscript%3E')

    expect(page.text()).toContain(FAILED)
    expect(page.text()).not.toContain('script')
  })

  it('код-служебное имя (__proto__) — общий текст, не падаем', async () => {
    const page = await openPage('/auth/account-deleted?error=__proto__')

    expect(page.text()).toContain(FAILED)
  })

  it('без параметров — «аккаунт не удалён» с общим текстом, сессия не трогается', async () => {
    useAuthStore().setSession(SESSION)

    const page = await openPage('/auth/account-deleted')

    expect(page.text()).toContain(NOT_DELETED_TITLE)
    expect(refreshCalls).toBe(0)
    expect(useAuthStore().isAuthenticated).toBe(true)
  })
})
