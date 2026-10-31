import { mountSuspended } from '@nuxt/test-utils/runtime'
import type { VueWrapper } from '@vue/test-utils'
import { afterEach, describe, expect, it } from 'vitest'
import { clearNuxtState, useState } from '#imports'
import { AppFooter } from '@/widgets/app-footer'

const SERVER_YEAR = 1999

let wrapper: VueWrapper

afterEach(() => {
  wrapper.unmount()
  clearNuxtState('footer-year')
})

describe('AppFooter', () => {
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
