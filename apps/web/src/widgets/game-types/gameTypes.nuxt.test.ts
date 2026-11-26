import { mountSuspended } from '@nuxt/test-utils/runtime'
import type { VueWrapper } from '@vue/test-utils'
import { afterEach, describe, expect, it } from 'vitest'
import { GameTypes } from '@/widgets/game-types'

let wrapper: VueWrapper

afterEach(() => {
  wrapper.unmount()
})

describe('GameTypes', () => {
  it('заголовок, подзаголовок и ссылки на страницы типов по порядку', async () => {
    wrapper = await mountSuspended(GameTypes)

    expect(wrapper.get('h2').text()).toBe('Познакомьтесь с нашими играми')
    expect(wrapper.get('.game-types__subtitle').text()).toBe(
      'Нажмите на игру: покажем, как она устроена, и примеры готовых заданий.',
    )
    const hrefs = wrapper.findAll('a').map((link) => link.attributes('href'))
    expect(hrefs).toEqual(['/games/quiz', '/games/matching', '/games/true-false'])
  })

  it('на английском: заголовок и адреса с префиксом /en', async () => {
    wrapper = await mountSuspended(GameTypes, { route: '/en' })

    expect(wrapper.get('h2').text()).toBe('Get to know our games')
    const hrefs = wrapper.findAll('a').map((link) => link.attributes('href'))
    expect(hrefs).toEqual(['/en/games/quiz', '/en/games/matching', '/en/games/true-false'])
  })
})
