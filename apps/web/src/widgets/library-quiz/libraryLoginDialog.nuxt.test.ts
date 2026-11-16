import { mountSuspended } from '@nuxt/test-utils/runtime'
import { flushPromises, type VueWrapper } from '@vue/test-utils'
import { afterEach, describe, expect, it } from 'vitest'
import LibraryLoginDialog from './LibraryLoginDialog.vue'

const SCROLL_LOCK_CLASS = 'is-scroll-locked'
const RU_QUIZ_PATH = '/library/quiz/5-столицы'
const EN_QUIZ_PATH = '/en/library/quiz/12-capitals'

let wrapper: VueWrapper

type Props = { open?: boolean; loginTo?: { path: string; query: { next: string } }; registerTo?: string }

async function mountDialog(props: Props = {}, route?: string) {
  wrapper = await mountSuspended(LibraryLoginDialog, {
    props: {
      open: props.open ?? false,
      loginTo: props.loginTo ?? { path: '/auth/login', query: { next: RU_QUIZ_PATH } },
      registerTo: props.registerTo ?? '/auth/register',
    },
    attachTo: document.body,
    route,
  })
  await flushPromises()
}

function dialog() {
  return wrapper.find('dialog')
}

function isOpen() {
  return (dialog().element as HTMLDialogElement).open
}

function link(name: string) {
  const found = wrapper.findAll('a').find((item) => item.text() === name)
  if (!found) throw new Error(`Нет ссылки «${name}»`)
  return found
}

function nextOf(href: string | undefined) {
  return new URL(href ?? '', 'http://localhost').searchParams.get('next')
}

afterEach(() => {
  wrapper.unmount()
  document.documentElement.classList.remove(SCROLL_LOCK_CLASS)
})

describe('LibraryLoginDialog', () => {
  it('open=false: окно закрыто; open=true: открыто; снова false: закрыто', async () => {
    await mountDialog()
    expect(isOpen()).toBe(false)

    await wrapper.setProps({ open: true })
    expect(isOpen()).toBe(true)

    await wrapper.setProps({ open: false })
    expect(isOpen()).toBe(false)
  })

  it('смонтировано сразу с open=true: окно открыто', async () => {
    await mountDialog({ open: true })

    expect(isOpen()).toBe(true)
  })

  it('содержимое: заголовок, пояснение, «Войти», «Зарегистрироваться», «Закрыть»', async () => {
    await mountDialog({ open: true })

    expect(wrapper.find('h2').text()).toBe('Войдите, чтобы взять задание')
    expect(wrapper.text()).toContain('Задание появится в «Моих заданиях»')
    expect(link('Войти').exists()).toBe(true)
    expect(link('Зарегистрироваться').exists()).toBe(true)
    expect(wrapper.find('.library-login-dialog__close').text()).toBe('Закрыть')
    expect(dialog().attributes('aria-labelledby')).toBe(wrapper.find('h2').attributes('id'))
  })

  describe('закрытие', () => {
    it('«Закрыть» отправляет close', async () => {
      await mountDialog({ open: true })

      await wrapper.find('.library-login-dialog__close').trigger('click')

      expect(wrapper.emitted('close')).toHaveLength(1)
    })

    it('Esc (cancel у dialog) отправляет close и не закрывает окно сам', async () => {
      await mountDialog({ open: true })

      const cancel = new Event('cancel', { cancelable: true })
      dialog().element.dispatchEvent(cancel)
      await flushPromises()

      expect(wrapper.emitted('close')).toHaveLength(1)
      // Решение о закрытии за родителем: окно закрывается только когда open станет false
      expect(cancel.defaultPrevented).toBe(true)
    })

    it('клик по затемнению (по самому dialog) отправляет close', async () => {
      await mountDialog({ open: true })

      await dialog().trigger('click')

      expect(wrapper.emitted('close')).toHaveLength(1)
    })

    it('клик внутри панели не закрывает окно', async () => {
      await mountDialog({ open: true })

      await wrapper.find('.app-dialog__panel').trigger('click')
      await wrapper.find('h2').trigger('click')

      expect(wrapper.emitted('close')).toBeUndefined()
    })
  })

  describe('ссылки', () => {
    it('«Войти» ведёт на вход с next, «Зарегистрироваться» — без next', async () => {
      await mountDialog({ open: true })

      const login = link('Войти').attributes('href')
      expect(login).toMatch(/^\/auth\/login\?/)
      expect(nextOf(login)).toBe(RU_QUIZ_PATH)
      expect(link('Зарегистрироваться').attributes('href')).toBe('/auth/register')
    })

    it('английский: next с префиксом /en, регистрация /en/auth/register без next', async () => {
      await mountDialog({
        open: true,
        loginTo: { path: '/en/auth/login', query: { next: EN_QUIZ_PATH } },
        registerTo: '/en/auth/register',
      }, EN_QUIZ_PATH)

      const login = link('Sign in').attributes('href')
      expect(login).toMatch(/^\/en\/auth\/login\?/)
      expect(nextOf(login)).toBe(EN_QUIZ_PATH)
      expect(link('Create an account').attributes('href')).toBe('/en/auth/register')
    })

    it('кириллический slug в next не теряется и не двоится', async () => {
      await mountDialog({ open: true })

      const href = link('Войти').attributes('href')
      expect(new URL(href ?? '', 'http://localhost').searchParams.getAll('next')).toEqual([RU_QUIZ_PATH])
      expect(href).not.toContain('столицы')
    })

    it('символы адреса в next кодируются: чужие параметры не просачиваются', async () => {
      const next = '/library/quiz/5-a?x=1&next=//evil.example#h'
      await mountDialog({ open: true, loginTo: { path: '/auth/login', query: { next } } })

      const url = new URL(link('Войти').attributes('href') ?? '', 'http://localhost')
      expect([...url.searchParams.keys()]).toEqual(['next'])
      expect(url.searchParams.get('next')).toBe(next)
    })

    it('ссылка меняется вместе со свойством loginTo', async () => {
      await mountDialog({ open: true })

      await wrapper.setProps({ loginTo: { path: '/auth/login', query: { next: '/library/quiz/7-b' } } })

      expect(nextOf(link('Войти').attributes('href'))).toBe('/library/quiz/7-b')
    })
  })

  describe('блокировка прокрутки страницы', () => {
    it('до открытия класса нет', async () => {
      await mountDialog()

      expect(document.documentElement.classList.contains(SCROLL_LOCK_CLASS)).toBe(false)
    })

    it('ставится при открытии и снимается при закрытии', async () => {
      await mountDialog()

      await wrapper.setProps({ open: true })
      expect(document.documentElement.classList.contains(SCROLL_LOCK_CLASS)).toBe(true)

      await wrapper.setProps({ open: false })
      expect(document.documentElement.classList.contains(SCROLL_LOCK_CLASS)).toBe(false)
    })

    it('повторное открытие снова ставит класс', async () => {
      await mountDialog()

      await wrapper.setProps({ open: true })
      await wrapper.setProps({ open: false })
      await wrapper.setProps({ open: true })

      expect(document.documentElement.classList.contains(SCROLL_LOCK_CLASS)).toBe(true)
    })

    it('снимается при размонтировании открытого окна', async () => {
      await mountDialog()
      await wrapper.setProps({ open: true })
      expect(document.documentElement.classList.contains(SCROLL_LOCK_CLASS)).toBe(true)

      wrapper.unmount()

      expect(document.documentElement.classList.contains(SCROLL_LOCK_CLASS)).toBe(false)
    })
  })
})
