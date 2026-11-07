import { mountSuspended } from '@nuxt/test-utils/runtime'
import type { VueWrapper } from '@vue/test-utils'
import { flushPromises } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useAuthStore } from '@/features/auth'
import ResetPasswordPage from './ResetPasswordPage.vue'

// fetch подменяется: страница, takeTokenFromHash, authApi и apiClient — настоящие
const TOKEN = 'qa-Reset_0123456789abcdefghijklmnopqrstuvwx'
const NEW_PASSWORD = 'qa-new-staple-battery-2026'
const MISSING_TOKEN = 'Ссылка неполная. Откройте письмо и перейдите по ссылке ещё раз'
const INVALID_LINK = 'Ссылка недействительна или устарела. Запросите новую'

type FetchCall = { url: string; init: RequestInit }

let wrapper: VueWrapper | undefined
let calls: FetchCall[]
let respond: () => Promise<Response>

function reply(body: unknown, status: number, headers: Record<string, string> = {}) {
  return () => Promise.resolve(new Response(body === null ? null : JSON.stringify(body), { status, headers }))
}

async function openPage(hash: string) {
  window.history.replaceState(null, '', `/auth/reset-password${hash}`)
  wrapper = await mountSuspended(ResetPasswordPage)
  await flushPromises()
  return wrapper
}

async function submitPassword(page: VueWrapper, password: string) {
  await page.find('input[type="password"]').setValue(password)
  await page.find('form').trigger('submit')
  await flushPromises()
}

beforeEach(() => {
  calls = []
  respond = reply(null, 204)
  vi.stubGlobal('fetch', (url: string, init: RequestInit) => {
    calls.push({ url, init })
    return respond()
  })
})

afterEach(() => {
  wrapper?.unmount()
  wrapper = undefined
  vi.unstubAllGlobals()
  window.history.replaceState(null, '', '/')
})

describe('ResetPasswordPage: токен из ссылки', () => {
  it('токен из #token= читается и сразу убирается из адреса', async () => {
    await openPage(`#token=${TOKEN}`)

    expect(window.location.hash).toBe('')
    expect(window.location.href).not.toContain(TOKEN)
    expect(window.location.pathname).toBe('/auth/reset-password')
  })

  it('форма из одного поля «Новый пароль» с autocomplete=new-password, без почты', async () => {
    const page = await openPage(`#token=${TOKEN}`)

    expect(page.find('input[type="email"]').exists()).toBe(false)
    expect(page.find('input[type="password"]').attributes('autocomplete')).toBe('new-password')
    expect(page.text()).toContain('Новый пароль')
  })

  it.each([
    ['нет фрагмента', ''],
    ['пустой токен', '#token='],
    ['токен в query, а не во фрагменте', `?token=${TOKEN}`],
  ])('%s — «Ссылка неполная», отправка не уходит на сервер', async (_name, hash) => {
    const page = await openPage(hash)
    expect(page.text()).toContain(MISSING_TOKEN)

    await submitPassword(page, NEW_PASSWORD)

    expect(calls).toEqual([])
    expect(page.text()).toContain(MISSING_TOKEN)
  })
})

describe('ResetPasswordPage: новый пароль', () => {
  it.each([
    ['популярный', 'qwerty', 'Этот пароль слишком простой — придумайте другой'],
    ['короткий', 'abc', 'Пароль — не короче 4 символов'],
    ['пустой', '', 'Введите пароль'],
  ])('%s пароль — подсказка до запроса по resetPasswordSchema', async (_name, password, text) => {
    const page = await openPage(`#token=${TOKEN}`)

    await submitPassword(page, password)

    expect(calls).toEqual([])
    expect(page.text()).toContain(text)
  })

  it('204 — запрос с токеном и паролем, экран «Пароль изменён», формы больше нет', async () => {
    const page = await openPage(`#token=${TOKEN}`)

    await submitPassword(page, NEW_PASSWORD)

    expect(calls).toHaveLength(1)
    expect(calls[0]?.url).toBe('/api/auth/reset-password')
    expect(JSON.parse(String(calls[0]?.init.body))).toEqual({ token: TOKEN, password: NEW_PASSWORD })
    expect(page.find('h1').text()).toBe('Пароль изменён')
    expect(page.find('form').exists()).toBe(false)
    expect(page.find('a[href="/auth/login"]').exists()).toBe(true)
  })

  it('после 204 токен стёрт: страница больше ничего не отправляет и не держит токен в разметке', async () => {
    const page = await openPage(`#token=${TOKEN}`)
    await submitPassword(page, NEW_PASSWORD)

    expect(page.html()).not.toContain(TOKEN)
    expect(window.location.href).not.toContain(TOKEN)
    expect(calls).toHaveLength(1)
  })

  it('400 — «Ссылка недействительна или устарела», форма остаётся', async () => {
    respond = reply({ error: 'The reset link is invalid or expired, request a new one' }, 400)
    const page = await openPage(`#token=${TOKEN}`)

    await submitPassword(page, NEW_PASSWORD)

    expect(page.text()).toContain(INVALID_LINK)
    expect(page.find('form').exists()).toBe(true)
    expect(page.text()).not.toContain('request a new one')
  })

  it('400 с issues по паролю — ошибка у поля', async () => {
    respond = reply({ error: 'Validation failed', issues: [{ path: ['password'], message: 'Password is too common' }] }, 400)
    const page = await openPage(`#token=${TOKEN}`)

    await submitPassword(page, NEW_PASSWORD)

    expect(page.text()).toContain('Этот пароль слишком простой — придумайте другой')
  })

  it('429 — «через N мин.» из Retry-After', async () => {
    respond = reply({ error: 'Too many attempts, try again later' }, 429, { 'Retry-After': '300' })
    const page = await openPage(`#token=${TOKEN}`)

    await submitPassword(page, NEW_PASSWORD)

    expect(page.text()).toContain('Слишком много попыток. Попробуйте через 5 мин.')
  })
})

describe('ResetPasswordPage: выход на всех вкладках после сброса', () => {
  const SESSION = {
    accessToken: 'qa-old-access-token',
    teacher: { id: '6b9a8d38-2d8b-4b8f-9d6e-1b2c3d4e5f60', email: 'qa@example.test', displayName: null, hasPassword: true, hasGoogle: false },
  }
  let otherTab: BroadcastChannel
  let received: unknown[]

  beforeEach(() => {
    received = []
    // Другая вкладка: тот же канал, что у синхронизации сессии
    otherTab = new BroadcastChannel('nataskium-auth')
    otherTab.addEventListener('message', (event) => received.push(event.data))
  })

  afterEach(() => {
    otherTab.close()
  })

  it('204 — сессия этой вкладки сброшена, другие вкладки получают logout', async () => {
    const page = await openPage(`#token=${TOKEN}`)
    const store = useAuthStore()
    store.setSession(SESSION)

    await submitPassword(page, NEW_PASSWORD)
    await vi.waitFor(() => expect(received).toContainEqual({ type: 'logout' }))

    expect(store.accessToken).toBeNull()
    expect(store.status).toBe('anonymous')
  })

  it('400 — сессия остаётся, logout не рассылается', async () => {
    respond = reply({ error: 'Invalid or expired link' }, 400)
    const page = await openPage(`#token=${TOKEN}`)
    const store = useAuthStore()
    store.setSession(SESSION)

    await submitPassword(page, NEW_PASSWORD)
    await flushPromises()

    expect(store.accessToken).toBe(SESSION.accessToken)
    expect(received).toEqual([])
  })
})
