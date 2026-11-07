import { mountSuspended } from '@nuxt/test-utils/runtime'
import type { VueWrapper } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises } from '@vue/test-utils'
import ForgotPasswordPage from './ForgotPasswordPage.vue'

// fetch подменяется: страница, authApi и apiClient — настоящие
const SENT_TITLE = 'Проверьте почту'
const SENT_SUBTITLE = 'Если аккаунт с этой почтой есть, мы отправили письмо со ссылкой для нового пароля.'
const ACCEPTED = { message: 'If an account with a password exists for this email, we sent a reset link' }

type FetchCall = { url: string; init: RequestInit }

let wrapper: VueWrapper
let calls: FetchCall[]
let respond: () => Promise<Response>

function reply(body: unknown, status: number, headers: Record<string, string> = {}) {
  return () => Promise.resolve(new Response(JSON.stringify(body), { status, headers }))
}

async function submitEmail(email: string) {
  await wrapper.find('input[type="email"]').setValue(email)
  await wrapper.find('form').trigger('submit')
  await flushPromises()
}

beforeEach(async () => {
  calls = []
  respond = reply(ACCEPTED, 202)
  vi.stubGlobal('fetch', (url: string, init: RequestInit) => {
    calls.push({ url, init })
    return respond()
  })
  wrapper = await mountSuspended(ForgotPasswordPage)
})

afterEach(() => {
  wrapper.unmount()
  vi.unstubAllGlobals()
})

describe('ForgotPasswordPage', () => {
  it('форма из одной почты, без поля пароля', () => {
    expect(wrapper.findAll('input[type="email"]')).toHaveLength(1)
    expect(wrapper.find('input[type="password"]').exists()).toBe(false)
  })

  it('отправляет нормализованный email на /api/auth/forgot-password', async () => {
    await submitEmail(' QA-Anna@Example.TEST ')

    expect(calls).toHaveLength(1)
    expect(calls[0]?.url).toBe('/api/auth/forgot-password')
    expect(JSON.parse(String(calls[0]?.init.body))).toEqual({ email: 'qa-anna@example.test' })
  })

  // По экрану не понять, есть ли аккаунт: текст один для любого адреса
  it.each(['qa-anna@example.test', 'qa-nobody@example.test'])('после 202 для %s — один и тот же экран «Проверьте почту»', async (email) => {
    await submitEmail(email)

    expect(wrapper.find('h1').text()).toBe(SENT_TITLE)
    expect(wrapper.find('.auth-card__subtitle').text()).toBe(SENT_SUBTITLE)
    expect(wrapper.find('form').exists()).toBe(false)
    expect(wrapper.text()).not.toContain(email)
  })

  it('пустая почта — «Введите почту», запроса нет', async () => {
    await submitEmail('   ')

    expect(calls).toEqual([])
    expect(wrapper.text()).toContain('Введите почту')
  })

  it('неверная почта — подсказка до запроса', async () => {
    await submitEmail('not-an-email')

    expect(calls).toEqual([])
    expect(wrapper.text()).toContain('Проверьте адрес почты')
  })

  it('429 — «через N мин.» из Retry-After, форма остаётся', async () => {
    respond = reply({ error: 'Too many attempts, try again later' }, 429, { 'Retry-After': '1800' })

    await submitEmail('qa-anna@example.test')

    expect(wrapper.text()).toContain('Слишком много попыток. Попробуйте через 30 мин.')
    expect(wrapper.find('form').exists()).toBe(true)
  })

  it('сбой сети — «Нет связи с сервером»', async () => {
    respond = () => Promise.reject(new TypeError('Failed to fetch'))

    await submitEmail('qa-anna@example.test')

    expect(wrapper.text()).toContain('Нет связи с сервером')
  })
})
