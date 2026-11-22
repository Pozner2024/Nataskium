import { describe, expect, it } from 'vitest'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import { IntroTheme } from '@/entities/intro-theme'

describe('IntroTheme', () => {
  it('ночь — тёмная сцена, день — светлая', async () => {
    const night = await mountSuspended(IntroTheme, { props: { themeKey: 'nataskium-night' } })
    const day = await mountSuspended(IntroTheme, { props: { themeKey: 'nataskium-day' } })
    expect(night.find('.nataskium-scene').classes()).toContain('nataskium-scene--dark')
    expect(day.find('.nataskium-scene').classes()).toContain('nataskium-scene--light')
  })

  it('без темы или с неизвестным ключом — тема по умолчанию (ночь)', async () => {
    for (const themeKey of [undefined, null, 'space']) {
      const wrapper = await mountSuspended(IntroTheme, { props: { themeKey } })
      expect(wrapper.find('.nataskium-scene').classes()).toContain('nataskium-scene--dark')
    }
  })

  it('сцена декоративная: скрыта от скринридера и не перехватывает клики', async () => {
    const wrapper = await mountSuspended(IntroTheme, { props: { themeKey: 'nataskium-night' } })
    expect(wrapper.find('.nataskium-scene').attributes('aria-hidden')).toBe('true')
  })

  it('чистая сцена без лого', async () => {
    const wrapper = await mountSuspended(IntroTheme, { props: { themeKey: 'nataskium-night' } })
    expect(wrapper.find('.nataskium-scene__logo').exists()).toBe(false)
    expect(wrapper.find('.nataskium-scene__pcb').exists()).toBe(true)
  })
})
