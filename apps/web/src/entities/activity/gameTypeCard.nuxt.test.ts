import { mountSuspended } from '@nuxt/test-utils/runtime'
import { describe, expect, it } from 'vitest'
import { ACTIVITY_TYPE_ORDER, GameTypeCard } from '@/entities/activity'

describe('GameTypeCard', () => {
  it('с адресом — ссылка на название, без кнопки', async () => {
    const wrapper = await mountSuspended(GameTypeCard, { props: { type: 'quiz', to: '/games/quiz' } })

    const link = wrapper.get('a')
    expect(link.attributes('href')).toBe('/games/quiz')
    expect(link.text()).toBe('Викторина')
    expect(wrapper.find('button').exists()).toBe(false)
  })

  it('без адреса — кнопка, клик отдаёт select, ссылки нет', async () => {
    const wrapper = await mountSuspended(GameTypeCard, { props: { type: 'matching' } })

    await wrapper.get('button').trigger('click')

    expect(wrapper.emitted('select')).toHaveLength(1)
    expect(wrapper.find('a').exists()).toBe(false)
  })

  it('превью скрыто от чтецов и без текста', async () => {
    const wrapper = await mountSuspended(GameTypeCard, { props: { type: 'truefalse' } })

    const preview = wrapper.get('.game-type-preview')
    expect(preview.attributes('aria-hidden')).toBe('true')
    expect(preview.text()).toBe('')
  })

  it.each(ACTIVITY_TYPE_ORDER)('%s: пояснение — готовый перевод, не ключ', async (type) => {
    const wrapper = await mountSuspended(GameTypeCard, { props: { type } })

    const description = wrapper.get('.game-type-card__description').text()
    expect(description).not.toBe('')
    expect(description).not.toContain('gameTypes.')
  })
})
