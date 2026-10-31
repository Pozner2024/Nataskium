import { mountSuspended } from '@nuxt/test-utils/runtime'
import { describe, expect, it } from 'vitest'
import { AppButton } from '@/shared'

const LABEL = 'Создать задание'

describe('AppButton', () => {
  it('без адреса остаётся кнопкой', async () => {
    const wrapper = await mountSuspended(AppButton, { slots: { default: () => LABEL } })

    expect(wrapper.element.tagName).toBe('BUTTON')
    expect(wrapper.attributes('type')).toBe('button')
    expect(wrapper.attributes('href')).toBeUndefined()
    expect(wrapper.text()).toBe(LABEL)
    wrapper.unmount()
  })

  it('с адресом становится ссылкой без атрибута type', async () => {
    const wrapper = await mountSuspended(AppButton, { props: { to: '/' }, slots: { default: () => LABEL } })

    expect(wrapper.element.tagName).toBe('A')
    expect(wrapper.attributes('href')).toBe('/')
    expect(wrapper.attributes('type')).toBeUndefined()
    expect(wrapper.attributes('to')).toBeUndefined()
    expect(wrapper.text()).toBe(LABEL)
    wrapper.unmount()
  })

  it.each([
    ['без адреса', {}],
    ['с адресом', { to: '/' }],
  ])('%s сохраняет класс цвета', async (_name, props) => {
    const wrapper = await mountSuspended(AppButton, { props: { ...props, color: 'blue' } })

    expect(wrapper.classes()).toEqual(expect.arrayContaining(['app-button', 'app-button--blue']))
    wrapper.unmount()
  })
})
