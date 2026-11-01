import { mountSuspended } from '@nuxt/test-utils/runtime'
import type { VueWrapper } from '@vue/test-utils'
import { afterEach, describe, expect, it } from 'vitest'
import { clearNuxtState, useState } from '#imports'
import { AppFooter } from '@/widgets/app-footer'

const SERVER_YEAR = 1999
const FOOTER_ROWS = [
  ['Главная', '/'],
  ['Войти', '/login'],
  ['Зарегистрироваться', '/register'],
  ['Библиотека заданий', '/library'],
  ['Тарифные планы', '/pricing'],
  ['Язык: Русский', '/language'],
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
  it('показывает все 12 строк ссылками в нужном порядке', async () => {
    wrapper = await mountSuspended(AppFooter)

    const rows = wrapper.findAll('.footer-nav__list li > *')
    expect(rows.map(row => [row.text(), row.attributes('href')])).toEqual(FOOTER_ROWS)
    expect(rows.every(row => row.classes('footer-nav__link'))).toBe(true)
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
