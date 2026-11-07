import { mountSuspended } from '@nuxt/test-utils/runtime'
import type { VueWrapper } from '@vue/test-utils'
import { afterEach, describe, expect, it } from 'vitest'
import { AUTH_PAGE_PATHS } from '@nataskium/shared/routes'
import { AuthCard, type AuthCardProps } from '@/widgets/auth-card'

let wrapper: VueWrapper

async function mountCard(props: AuthCardProps) {
  wrapper = await mountSuspended(AuthCard, { props })
  return wrapper
}

afterEach(() => {
  wrapper.unmount()
})

describe('AuthCard: forgotPassword', () => {
  it('заголовок, подсказка и кнопка; только поле почты, без пароля и без Google', async () => {
    const card = await mountCard({ mode: 'forgotPassword' })

    expect(card.find('h1').text()).toBe('Восстановление пароля')
    expect(card.find('.auth-card__subtitle').text()).toBe('Введите почту аккаунта — пришлём ссылку для нового пароля')
    expect(card.find('button[type="submit"]').text()).toBe('Отправить ссылку')
    expect(card.findAll('input[type="email"]')).toHaveLength(1)
    expect(card.find('input[type="password"]').exists()).toBe(false)
    expect(card.find('.auth-card__google').exists()).toBe(false)
  })

  it('отправка — только email', async () => {
    const card = await mountCard({ mode: 'forgotPassword' })

    await card.find('input[type="email"]').setValue('qa-anna@example.test')
    await card.find('form').trigger('submit')

    expect(card.emitted('submit')).toEqual([[{ email: 'qa-anna@example.test' }]])
  })

  it('после отправки — один экран для любой почты, со ссылкой ко входу', async () => {
    const card = await mountCard({ mode: 'forgotPassword', isSent: true })

    expect(card.find('h1').text()).toBe('Проверьте почту')
    expect(card.find('.auth-card__subtitle').text()).toBe('Если аккаунт с этой почтой есть, мы отправили письмо со ссылкой для нового пароля.')
    expect(card.find('form').exists()).toBe(false)
    expect(card.find(`a[href="${AUTH_PAGE_PATHS.login}"]`).text()).toBe('Вернуться ко входу')
  })

  it('во время запроса кнопка выключена и говорит «Отправляем…»', async () => {
    const card = await mountCard({ mode: 'forgotPassword', isLoading: true })

    expect(card.find('button[type="submit"]').text()).toBe('Отправляем…')
    expect(card.find('button[type="submit"]').attributes('disabled')).toBeDefined()
  })
})

describe('AuthCard: resetPassword', () => {
  it('заголовок и поле «Новый пароль» с autocomplete=new-password, без почты и Google', async () => {
    const card = await mountCard({ mode: 'resetPassword' })

    expect(card.find('h1').text()).toBe('Новый пароль')
    expect(card.find('button[type="submit"]').text()).toBe('Сохранить пароль')
    expect(card.find('input[type="email"]').exists()).toBe(false)
    const password = card.find('input[type="password"]')
    expect(password.attributes('autocomplete')).toBe('new-password')
    expect(card.find(`label[for="${password.attributes('id')}"]`).text()).toContain('Новый пароль')
    expect(card.find('.auth-card__google').exists()).toBe(false)
  })

  it('отправка — только пароль', async () => {
    const card = await mountCard({ mode: 'resetPassword' })

    await card.find('input[type="password"]').setValue('qa-new-staple-battery')
    await card.find('form').trigger('submit')

    expect(card.emitted('submit')).toEqual([[{ password: 'qa-new-staple-battery' }]])
  })

  it('после успеха — «Пароль изменён» без значка письма, ссылка ко входу', async () => {
    const card = await mountCard({ mode: 'resetPassword', isSent: true })

    expect(card.find('h1').text()).toBe('Пароль изменён')
    expect(card.find('.auth-card__subtitle').text()).toBe('Войдите с новым паролем. На других устройствах нужно будет войти заново.')
    expect(card.find('.auth-card__mail').exists()).toBe(false)
    expect(card.find(`a[href="${AUTH_PAGE_PATHS.login}"]`).exists()).toBe(true)
  })

  it('ошибка формы и ошибка поля показываются', async () => {
    const card = await mountCard({
      mode: 'resetPassword',
      formError: 'Ссылка недействительна или устарела. Запросите новую',
      fieldErrors: { password: 'Пароль — не короче 4 символов' },
    })

    expect(card.find('.auth-card__alert').text()).toContain('Ссылка недействительна или устарела. Запросите новую')
    expect(card.text()).toContain('Пароль — не короче 4 символов')
    expect(card.find('input[type="password"]').attributes('aria-invalid')).toBe('true')
  })
})

describe('AuthCard: ссылка «Забыли пароль?»', () => {
  it('во входе — ссылка на /auth/forgot', async () => {
    const card = await mountCard({ mode: 'login' })

    const link = card.findAll('a').find((each) => each.text() === 'Забыли пароль?')
    expect(link?.attributes('href')).toBe(AUTH_PAGE_PATHS.forgotPassword)
    expect(AUTH_PAGE_PATHS.forgotPassword).toBe('/auth/forgot')
  })

  it.each(['register', 'forgotPassword', 'resetPassword', 'verifyEmail', 'linkGoogle'] as const)('в режиме %s ссылки нет', async (mode) => {
    const card = await mountCard({ mode })

    expect(card.findAll('a').some((each) => each.text() === 'Забыли пароль?')).toBe(false)
  })

  it('в восстановлении — ссылка «Войти» ко входу', async () => {
    const card = await mountCard({ mode: 'forgotPassword' })

    expect(card.text()).toContain('Вспомнили пароль?')
    expect(card.findAll('a').find((each) => each.text() === 'Войти')?.attributes('href')).toBe(AUTH_PAGE_PATHS.login)
  })
})
