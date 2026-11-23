import { mountSuspended } from '@nuxt/test-utils/runtime'
import { describe, expect, it } from 'vitest'
import { h } from 'vue'
import IntroThemePreview from './IntroThemePreview.vue'

const STUB_OPTIONS = 4

describe('IntroThemePreview', () => {
  it('без содержимого — полоски вопроса и четыре ответа, как раньше', async () => {
    const wrapper = await mountSuspended(IntroThemePreview, { props: { tone: 'dark' } })

    expect(wrapper.find('.intro-theme-preview__question').exists()).toBe(true)
    expect(wrapper.findAll('.intro-theme-preview__options i')).toHaveLength(STUB_OPTIONS)
    expect(wrapper.get('.intro-theme-preview').attributes('aria-hidden')).toBe('true')
  })

  it('содержимое встаёт в карточку вместо полосок, рамка и точки остаются', async () => {
    const wrapper = await mountSuspended(IntroThemePreview, {
      props: { tone: 'light' },
      slots: { default: () => h('b', { class: 'content' }, 'Вопрос') },
    })

    expect(wrapper.find('.intro-theme-preview__card .content').exists()).toBe(true)
    expect(wrapper.find('.intro-theme-preview__question').exists()).toBe(false)
    expect(wrapper.find('.intro-theme-preview__options').exists()).toBe(false)
    expect(wrapper.find('.intro-theme-preview__dots').exists()).toBe(true)
    expect(wrapper.get('.intro-theme-preview').attributes('aria-hidden')).toBe('true')
  })
})
