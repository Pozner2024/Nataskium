import { mountSuspended } from '@nuxt/test-utils/runtime'
import type { VueWrapper } from '@vue/test-utils'
import { afterEach, describe, expect, it } from 'vitest'
import { useRouter } from '#imports'
import { LanguageSwitcher } from '@/features/language-switcher'

let wrapper: VueWrapper

afterEach(async () => {
  wrapper.unmount()
  await useRouter().push('/')
})

describe('LanguageSwitcher', () => {
  it('показывает текущий язык и раскрываемое меню со всеми языками', async () => {
    wrapper = await mountSuspended(LanguageSwitcher)

    expect(wrapper.find('.language-switcher__label').text()).toBe('Язык:')
    expect(wrapper.find('.language-switcher__current').text()).toContain('Русский')
    expect(wrapper.find('details').attributes('open')).toBeUndefined()
    const links = wrapper.findAll('a').map((link) => [link.text(), link.attributes('href'), link.attributes('lang')])
    expect(links).toHaveLength(4)
    expect(links).toEqual(expect.arrayContaining([
      ['🇬🇧 English', '/en', 'en'],
      ['🇷🇺 Русский ✓', '/', 'ru'],
      ['🇩🇪 Deutsch', '/de', 'de'],
      ['🇫🇷 Français', '/fr', 'fr'],
    ]))
    expect(wrapper.findAll('[aria-disabled="true"]').map((item) => item.text())).toEqual([
      '🇺🇦 Українська Скоро', '🇪🇸 Español Скоро', '🇮🇹 Italiano Скоро', '🇵🇱 Polski Скоро',
      '🇳🇱 Nederlands Скоро', '🇨🇳 中文 Скоро',
    ])
  })

  it('текущий язык отмечен aria-current, остальные нет', async () => {
    wrapper = await mountSuspended(LanguageSwitcher)

    const current = wrapper.findAll('a').filter((link) => link.attributes('aria-current') === 'true')
    expect(current.map((link) => link.text())).toEqual(['🇷🇺 Русский ✓'])
  })

  it('переключатель назван для скринридера', async () => {
    wrapper = await mountSuspended(LanguageSwitcher)

    expect(wrapper.find('summary').attributes('aria-label')).toBe('Выбор языка')
  })

  it('закрывает меню после выбора языка', async () => {
    wrapper = await mountSuspended(LanguageSwitcher)
    const details = wrapper.find('details')
    details.element.setAttribute('open', '')

    const english = wrapper.findAll('a')[1]!
    await english.trigger('click')

    expect(details.attributes('open')).toBeUndefined()
  })

  it('на странице другого языка ссылки ведут на тот же раздел', async () => {
    wrapper = await mountSuspended(LanguageSwitcher, { route: '/en/auth/login' })

    const hrefs = wrapper.findAll('a').map((link) => link.attributes('href'))
    expect(hrefs).toHaveLength(4)
    expect(hrefs).toEqual(expect.arrayContaining(['/en/auth/login', '/auth/login']))
    for (const href of hrefs) expect(href).toMatch(/\/auth\/login$/)
    expect(wrapper.find('[aria-current="true"]').text()).toBe('🇬🇧 English ✓')
    expect(wrapper.find('.language-switcher__label').text()).toBe('Language:')
  })
})
