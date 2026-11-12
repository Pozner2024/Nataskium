import { mountSuspended } from '@nuxt/test-utils/runtime'
import type { VueWrapper } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'
import { useRouter } from '#imports'
import { authApi, useAuthStore } from '@/features/auth'
import { ApiError } from '@/shared'
import { AppHeader } from '@/widgets/app-header'

const OTHER_ROUTE = '/nat'
const MENU_GROUPS = [
  [['Главная', '/'], ['Библиотека заданий', '/library'], ['Тарифные планы', '/pricing']],
  [['Вопросы и ответы', '/faq'], ['Центр помощи', '/help']],
]
const HREF_LINKS = [
  'Библиотека заданий',
  'Тарифные планы',
  'Вопросы и ответы',
  'Центр помощи',
  'Зарегистрироваться',
]

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
  useAuthStore().clearSession()
  vi.restoreAllMocks()
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

    it('показывает два списка ссылок в нужном порядке', async () => {
      await mountHeader()

      const lists = wrapper.findAll('.app-header__list').map(list =>
        list.findAll('.app-header__item').map(item => [item.text(), item.attributes('href')]),
      )
      expect(lists).toEqual(MENU_GROUPS)
    })

    it('все пункты меню — ссылки', async () => {
      await mountHeader()

      const tags = wrapper.findAll('.app-header__item').map(item => item.element.tagName)
      expect(new Set(tags)).toEqual(new Set(['A']))
    })

    it('внизу панели «Войти», под ней ссылка на регистрацию', async () => {
      await mountHeader()

      const auth = wrapper.find('.app-header__auth')
      expect(auth.findAll('a, button').map(element => element.text())).toEqual(['Войти', 'Зарегистрироваться'])
      expect(auth.find('.app-header__register').attributes('href')).toBe('/auth/register')
    })

    it('«Войти» — AppButton со стрелкой', async () => {
      await mountHeader()

      const login = wrapper.find('.app-header__login')
      expect(login.element.tagName).toBe('A')
      expect(login.attributes('href')).toBe('/auth/login')
      expect(login.classes()).toEqual(expect.arrayContaining(['app-button', 'app-button--blue']))
      expect(login.find('.app-button__arrow').exists()).toBe(true)
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

  describe('английская версия', () => {
    const ENGLISH_GROUPS = [
      [['Home', '/en'], ['Activity library', '/en/library'], ['Pricing plans', '/en/pricing']],
      [['FAQ', '/en/faq'], ['Help center', '/en/help']],
    ]

    async function mountEnglishHeader() {
      wrapper = await mountSuspended(AppHeader, { route: '/en', attachTo: document.body })
      return wrapper
    }

    it('пункты меню на английском, адреса с префиксом /en', async () => {
      await mountEnglishHeader()

      const lists = wrapper.findAll('.app-header__list').map(list =>
        list.findAll('a').map(item => [item.text(), item.attributes('href')]))
      expect(lists).toEqual(ENGLISH_GROUPS)
    })

    it('вход, регистрация и подписи кнопок на английском', async () => {
      await mountEnglishHeader()

      const login = wrapper.find('.app-header__login')
      expect([login.text(), login.attributes('href')]).toEqual(['Sign in', '/en/auth/login'])
      const register = wrapper.find('.app-header__register')
      expect([register.text(), register.attributes('href')]).toEqual(['Sign up', '/en/auth/register'])
      expect(wrapper.find('nav').attributes('aria-label')).toBe('Menu')
      expect(wrapper.find('.app-header__burger').attributes('aria-label')).toBe('Open menu')
      expect(wrapper.find('.app-header__logo').attributes('href')).toBe('/en')
    })

    it('«Выйти» — «Sign out», пункты учителя на английском', async () => {
      useAuthStore().setSession({
        accessToken: 'access-1',
        teacher: { id: '6f1c2a4e-8d3b-4f5a-9c7e-1b2d3e4f5a6b', email: 'qa-anna@example.test', displayName: 'Anna', hasPassword: true, hasGoogle: false },
      })
      await mountEnglishHeader()

      expect(wrapper.find('.app-header__logout').text()).toBe('Sign out')
      expect(wrapper.find('.app-header__list').findAll('a').map(item => item.text())).toEqual([
        'Create activity',
        'My activities',
        'Manage subscription',
      ])
    })
  })

  describe('учитель вошёл', () => {
    const TEACHER_ROWS = [
      ['Создать задание', '/teacher/activities/new'],
      ['Мои задания', '/teacher/activities'],
      ['Управление подпиской', '/teacher/subscription'],
    ]

    function signIn() {
      useAuthStore().setSession({
        accessToken: 'access-1',
        teacher: {
          id: '6f1c2a4e-8d3b-4f5a-9c7e-1b2d3e4f5a6b',
          email: 'qa-anna@example.test',
          displayName: 'Анна',
          hasPassword: true,
          hasGoogle: false,
        },
      })
    }

    it('первым в меню идёт список учителя, внизу только «Выйти»', async () => {
      signIn()
      await mountHeader()

      const firstList = wrapper.find('.app-header__list').findAll('a')
      expect(firstList.map(item => [item.text(), item.attributes('href')])).toEqual(TEACHER_ROWS)
      expect(wrapper.findAll('.app-header__list')).toHaveLength(MENU_GROUPS.length + 1)
      const auth = wrapper.find('.app-header__auth')
      expect(auth.findAll('a, button').map(element => element.text())).toEqual(['Выйти'])
    })

    it('«Выйти» завершает сессию на сервере, закрывает меню и возвращает вход', async () => {
      const logout = vi.spyOn(authApi, 'logout').mockResolvedValue()
      signIn()
      await mountHeader()
      await openMenu()

      await wrapper.find('.app-header__logout').trigger('click')
      await vi.waitFor(() => expect(useAuthStore().status).toBe('anonymous'))
      await nextTick()

      expect(logout).toHaveBeenCalledOnce()
      expect(isMenuOpen()).toBe(false)
      expect(wrapper.find('.app-header__login').exists()).toBe(true)
      expect(wrapper.findAll('.app-header__list')).toHaveLength(MENU_GROUPS.length)
    })

    it('сервер не подтвердил выход — учитель остаётся вошедшим', async () => {
      const logout = vi.spyOn(authApi, 'logout').mockRejectedValue(new ApiError(503))
      signIn()
      await mountHeader()
      await openMenu()

      await wrapper.find('.app-header__logout').trigger('click')
      await vi.waitFor(() => expect(logout).toHaveBeenCalledOnce())
      await nextTick()

      expect(useAuthStore().status).toBe('authenticated')
      expect(wrapper.find('.app-header__logout').exists()).toBe(true)
    })
  })

  describe('ссылка на страницу, которой пока нет', () => {
    it.each(HREF_LINKS)('клик по %s закрывает меню', async (label) => {
      await mountHeader()
      await openMenu()
      const link = wrapper.findAll('a').find(element => element.text() === label)!
      link.element.addEventListener('click', event => event.preventDefault())

      await link.trigger('click')
      await nextTick()

      expect(isMenuOpen()).toBe(false)
      expect(document.documentElement.style.overflow).toBe('')
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
      const register = wrapper.find<HTMLElement>('.app-header__register').element
      register.focus()

      const event = pressKey(register, { key: 'Tab' })

      expect(event.defaultPrevented).toBe(true)
      expect(document.activeElement).toBe(wrapper.find('.app-header__burger').element)
    })

    it('Shift+Tab с бургера ведёт на последний элемент шторки', async () => {
      await mountHeader()
      await openMenu()
      const burger = wrapper.find<HTMLElement>('.app-header__burger').element
      burger.focus()

      pressKey(burger, { key: 'Tab', shiftKey: true })

      expect(document.activeElement).toBe(wrapper.find('.app-header__register').element)
    })
  })
})
