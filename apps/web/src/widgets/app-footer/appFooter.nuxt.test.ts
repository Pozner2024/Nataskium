import { mountSuspended } from '@nuxt/test-utils/runtime'
import type { VueWrapper } from '@vue/test-utils'
import { afterEach, describe, expect, it } from 'vitest'
import { clearNuxtState, useState } from '#imports'
import { AppFooter } from '@/widgets/app-footer'

const SERVER_YEAR = 1999
const FOOTER_ROWS = [
  ['Главная', '/'],
  ['Войти', '/auth/login'],
  ['Зарегистрироваться', '/auth/register'],
  ['Библиотека заданий', '/library'],
  ['Тарифные планы', '/pricing'],
  ['Вопросы и ответы', '/faq'],
  ['Создано Натальей Позняк', '/author'],
  ['Политика конфиденциальности', '/privacy'],
  ['Условия возврата', '/refund'],
  ['Связаться: hello@nataskium.com', 'mailto:hello@nataskium.com'],
  ['Центр помощи', '/help'],
]

let wrapper: VueWrapper

afterEach(() => {
  wrapper.unmount()
  clearNuxtState('footer-year')
})

describe('AppFooter', () => {
  it('показывает все 11 строк ссылками в нужном порядке', async () => {
    wrapper = await mountSuspended(AppFooter)

    const rows = wrapper.findAll('.footer-nav__list > .footer-nav__item:not(.footer-nav__item--language) > *')
    expect(rows.map(row => [row.text(), row.attributes('href')])).toEqual(FOOTER_ROWS)
    expect(rows.every(row => row.classes('footer-nav__link'))).toBe(true)
  })

  it('на английском: заголовки, строки и адреса с префиксом /en', async () => {
    wrapper = await mountSuspended(AppFooter, { route: '/en' })

    expect(wrapper.findAll('.footer-nav__title').map(title => title.text())).toEqual(['Navigation', 'About'])
    const rows = wrapper.findAll('.footer-nav__list > .footer-nav__item:not(.footer-nav__item--language) > *')
    expect(rows.map(row => [row.text(), row.attributes('href')])).toEqual([
      ['Home', '/en'],
      ['Sign in', '/en/auth/login'],
      ['Sign up', '/en/auth/register'],
      ['Activity library', '/en/library'],
      ['Pricing plans', '/en/pricing'],
      ['FAQ', '/en/faq'],
      ['Created by Natallia Pazniak', '/en/author'],
      ['Privacy policy', '/en/privacy'],
      ['Refund policy', '/en/refund'],
      ['Contact: hello@nataskium.com', 'mailto:hello@nataskium.com'],
      ['Help center', '/en/help'],
    ])
    expect(wrapper.find('.app-footer__logo').attributes('href')).toBe('/en')
  })

  it('выводит текущий год', async () => {
    wrapper = await mountSuspended(AppFooter)

    expect(wrapper.find('.app-footer__copyright').text()).toBe(`© ${new Date().getFullYear()}`)
  })

  it('берёт год, с которым страницу отрисовал сервер', async () => {
    useState('footer-year').value = SERVER_YEAR

    wrapper = await mountSuspended(AppFooter)

    expect(wrapper.find('.app-footer__copyright').text()).toBe(`© ${SERVER_YEAR}`)
  })
})
