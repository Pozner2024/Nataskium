import { mountSuspended } from '@nuxt/test-utils/runtime'
import type { VueWrapper } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'
import { useRouter } from '#imports'
import { AppHeader } from '@/widgets/app-header'

const OTHER_ROUTE = '/nat'

let wrapper: VueWrapper

async function mountHeader(props: { hasGlow?: boolean } = {}) {
  wrapper = await mountSuspended(AppHeader, { props, attachTo: document.body })
  return wrapper
}

async function openMenu() {
  await wrapper.find('.app-header__burger').trigger('click')
  await nextTick()
}

function isMenuOpen() {
  return wrapper.find('.app-header__burger').attributes('aria-expanded') === 'true'
}

function pressKey(target: Element, init: KeyboardEventInit) {
  const event = new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...init })
  target.dispatchEvent(event)
  return event
}

// Так бывает после клика по пустому месту шторки
function activeElementToBody() {
  (document.activeElement as HTMLElement).blur()
}

afterEach(async () => {
  wrapper.unmount()
  await useRouter().push('/')
})

describe('AppHeader', () => {
  describe('закрытое меню', () => {
    it('скрыто от клавиатуры и скринридера', async () => {
      await mountHeader()

      const burger = wrapper.find('.app-header__burger')
      expect(burger.attributes('aria-expanded')).toBe('false')
      expect(burger.attributes('aria-label')).toBe('Открыть меню')
      expect(wrapper.find('nav').attributes('inert')).toBeDefined()
    })

    it('бургер связан со шторкой через aria-controls', async () => {
      await mountHeader()

      const controls = wrapper.find('.app-header__burger').attributes('aria-controls')
      expect(wrapper.find('nav').attributes('id')).toBe(controls)
    })

    it('не перехватывает Tab и Escape', async () => {
      await mountHeader()
      const burger = wrapper.find('.app-header__burger').element

      expect(pressKey(burger, { key: 'Tab' }).defaultPrevented).toBe(false)
      pressKey(burger, { key: 'Escape' })
      await nextTick()

      expect(isMenuOpen()).toBe(false)
    })
  })

  describe('содержимое', () => {
    it('показывает пункт меню, вход и ссылку на главную в логотипе', async () => {
      await mountHeader()

      expect(wrapper.find('.app-header__item').text()).toBe('Главная')
      expect(wrapper.find('.app-header__item').attributes('href')).toBe('/')
      expect(wrapper.find('.app-header__login').text()).toBe('Войти')
      expect(wrapper.find('.app-header__logo').attributes('href')).toBe('/')
    })

    it('включает пятно боке только по пропу hasGlow', async () => {
      await mountHeader()
      expect(wrapper.find('.app-header').classes()).not.toContain('app-header--glow')
      wrapper.unmount()

      await mountHeader({ hasGlow: true })
      expect(wrapper.find('.app-header').classes()).toContain('app-header--glow')
    })
  })

  describe('открытие', () => {
    it('открывает шторку по клику на бургер', async () => {
      await mountHeader()
      await openMenu()

      const burger = wrapper.find('.app-header__burger')
      expect(burger.attributes('aria-expanded')).toBe('true')
      expect(burger.attributes('aria-label')).toBe('Закрыть меню')
      expect(wrapper.find('.app-header').classes()).toContain('app-header--menu-open')
      expect(wrapper.find('nav').attributes('inert')).toBeUndefined()
    })

    it('блокирует прокрутку страницы', async () => {
      await mountHeader()
      await openMenu()

      expect(document.documentElement.style.overflow).toBe('hidden')
    })

    it('переводит фокус на первый пункт шторки', async () => {
      await mountHeader()
      await openMenu()

      expect(document.activeElement).toBe(wrapper.find('.app-header__item').element)
    })
  })

  describe('закрытие', () => {
    it('закрывается вторым кликом по бургеру', async () => {
      await mountHeader()
      await openMenu()
      await openMenu()

      expect(isMenuOpen()).toBe(false)
    })

    it('закрывается по клику на затемнение', async () => {
      await mountHeader()
      await openMenu()
      await wrapper.find('.app-header__dim').trigger('click')

      expect(isMenuOpen()).toBe(false)
    })

    it('закрывается по Escape', async () => {
      await mountHeader()
      await openMenu()
      pressKey(wrapper.find('.app-header__item').element, { key: 'Escape' })
      await nextTick()

      expect(isMenuOpen()).toBe(false)
    })

    it('закрывается при смене маршрута', async () => {
      await mountHeader()
      await openMenu()
      await useRouter().push(OTHER_ROUTE)
      await nextTick()

      expect(isMenuOpen()).toBe(false)
    })

    it('возвращает фокус на бургер и снимает блокировку прокрутки', async () => {
      await mountHeader()
      await openMenu()
      await openMenu()
      await nextTick()

      expect(document.activeElement).toBe(wrapper.find('.app-header__burger').element)
      expect(document.documentElement.style.overflow).toBe('')
    })

    it('снимает блокировку прокрутки, если шапку убрали с открытым меню', async () => {
      await mountHeader()
      await openMenu()
      wrapper.unmount()

      expect(document.documentElement.style.overflow).toBe('')
    })
  })

  describe('клавиши при фокусе на body', () => {
    it('Escape закрывает открытое меню', async () => {
      await mountHeader()
      await openMenu()
      activeElementToBody()

      pressKey(document.body, { key: 'Escape' })
      await nextTick()

      expect(isMenuOpen()).toBe(false)
    })

    it('Tab возвращает фокус в открытое меню', async () => {
      await mountHeader()
      await openMenu()
      activeElementToBody()

      const event = pressKey(document.body, { key: 'Tab' })

      expect(event.defaultPrevented).toBe(true)
      expect(document.activeElement).toBe(wrapper.find('.app-header__burger').element)
    })

    it('при закрытом меню клавиши не перехватываются', async () => {
      await mountHeader()

      expect(pressKey(document.body, { key: 'Tab' }).defaultPrevented).toBe(false)
      expect(pressKey(document.body, { key: 'Escape' }).defaultPrevented).toBe(false)
      expect(isMenuOpen()).toBe(false)
    })

    it('после закрытия меню клавиши снова не перехватываются', async () => {
      await mountHeader()
      await openMenu()
      await openMenu()

      expect(pressKey(document.body, { key: 'Tab' }).defaultPrevented).toBe(false)
    })

    it('слушатель клавиш снимается при размонтировании с открытым меню', async () => {
      const addListener = vi.spyOn(document, 'addEventListener')
      const removeListener = vi.spyOn(document, 'removeEventListener')
      await mountHeader()
      await openMenu()
      const keydownCall = addListener.mock.calls.find(([type]) => type === 'keydown')

      wrapper.unmount()

      expect(keydownCall).toBeDefined()
      expect(removeListener).toHaveBeenCalledWith('keydown', keydownCall![1])
      addListener.mockRestore()
      removeListener.mockRestore()
    })
  })

  describe('ссылка на текущую страницу', () => {
    it.each([
      ['«Главная»', '.app-header__item'],
      ['логотипу', '.app-header__logo'],
    ])('клик по %s закрывает открытое меню', async (_name, selector) => {
      await mountHeader()
      await openMenu()

      await wrapper.find(selector).trigger('click')
      await nextTick()
      await nextTick()

      expect(isMenuOpen()).toBe(false)
      expect(document.documentElement.style.overflow).toBe('')
      expect(document.activeElement).toBe(wrapper.find('.app-header__burger').element)
    })

    it('клик по логотипу при закрытом меню не трогает фокус и состояние', async () => {
      await mountHeader()
      const logo = wrapper.find<HTMLElement>('.app-header__logo').element
      logo.focus()

      await wrapper.find('.app-header__logo').trigger('click')
      await nextTick()
      await nextTick()

      expect(isMenuOpen()).toBe(false)
      expect(document.activeElement).toBe(logo)
    })
  })

  describe('ловушка фокуса в открытом меню', () => {
    it('Tab с последнего элемента шторки ведёт на бургер', async () => {
      await mountHeader()
      await openMenu()
      const login = wrapper.find<HTMLElement>('.app-header__login').element
      login.focus()

      const event = pressKey(login, { key: 'Tab' })

      expect(event.defaultPrevented).toBe(true)
      expect(document.activeElement).toBe(wrapper.find('.app-header__burger').element)
    })

    it('Shift+Tab с бургера ведёт на последний элемент шторки', async () => {
      await mountHeader()
      await openMenu()
      const burger = wrapper.find<HTMLElement>('.app-header__burger').element
      burger.focus()

      pressKey(burger, { key: 'Tab', shiftKey: true })

      expect(document.activeElement).toBe(wrapper.find('.app-header__login').element)
    })
  })
})
