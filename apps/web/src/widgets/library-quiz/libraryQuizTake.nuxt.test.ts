import { mockNuxtImport, mountSuspended } from '@nuxt/test-utils/runtime'
import { flushPromises, type VueWrapper } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { clearNuxtState, useRouter } from '#imports'
import { type LibraryQuizResponse, libraryApi } from '@/entities/library'
import { authApi, useAuthStore } from '@/features/auth'
import { ApiError } from '@/shared'
import LibraryQuiz from './LibraryQuiz.vue'

const { navigateToMock } = vi.hoisted(() => ({ navigateToMock: vi.fn() }))
mockNuxtImport('navigateTo', () => navigateToMock)

const NUMBER = 12
const COPY_ID = '0b6a9c1e-7f3d-4a52-9e1b-3c5d7f9a1b2c'
const SIGNED_IN_HINT_KEY = 'nataskium-signed-in'
const TEACHER = {
  id: '6f1c2a4e-8d3b-4f5a-9c7e-1b2d3e4f5a6b',
  email: 'qa-anna@example.test',
  displayName: 'Анна',
  hasPassword: true,
  hasGoogle: false,
}
const SESSION = { accessToken: 'access-1', teacher: TEACHER }
const REFRESHED_SESSION = { accessToken: 'access-2', teacher: TEACHER }

const QUIZ_BODY: LibraryQuizResponse = {
  quiz: {
    number: NUMBER,
    title: 'Столицы',
    groupSlug: 'geography',
    questionCount: 1,
    graded: false,
    createdAt: '2026-11-15T10:00:00.000Z',
    questions: [{ text: 'Столица Франции?', imageUrl: null, options: [{ text: 'Париж', imageUrl: null }] }],
  },
}

// Шпион ставится до первого useSessionSync и не снимается: экземпляр на вкладку запоминает функцию refresh
const refresh = vi.spyOn(authApi, 'refresh')

let wrapper: VueWrapper

async function mountQuiz(route?: string) {
  wrapper = await mountSuspended(LibraryQuiz, { props: { number: NUMBER }, route, attachTo: document.body })
  await flushPromises()
}

function takeButton() {
  return wrapper.find('.library-quiz__actions button.app-button')
}

function dialog() {
  return wrapper.find('dialog').element as HTMLDialogElement
}

async function clickTake() {
  await takeButton().trigger('click')
  await flushPromises()
}

function nextOfLogin() {
  const login = wrapper.findAll('dialog a').find((link) => link.text() === 'Войти' || link.text() === 'Sign in')
  return new URL(login?.attributes('href') ?? '', 'http://localhost').searchParams.get('next')
}

beforeEach(() => {
  clearNuxtState('library-groups')
  navigateToMock.mockReset()
  refresh.mockReset()
  localStorage.clear()
  useAuthStore().$patch({ accessToken: null, teacher: null, status: 'unknown' })
  vi.spyOn(libraryApi, 'groups').mockResolvedValue({ groups: [] })
  vi.spyOn(libraryApi, 'get').mockResolvedValue(QUIZ_BODY)
})

afterEach(async () => {
  wrapper.unmount()
  vi.mocked(libraryApi.groups).mockRestore()
  vi.mocked(libraryApi.get).mockRestore()
  vi.mocked(libraryApi.take)?.mockRestore?.()
  await useRouter().push('/')
})

describe('LibraryQuiz: «Взять себе»', () => {
  describe('гость', () => {
    it('сессия проверена без запроса: кнопка включена', async () => {
      await mountQuiz()

      expect(takeButton().text()).toBe('Взять себе')
      expect(takeButton().attributes('disabled')).toBeUndefined()
      expect(refresh).not.toHaveBeenCalled()
    })

    it('клик открывает окно входа, копирование и переход не запускаются', async () => {
      const take = vi.spyOn(libraryApi, 'take')
      await mountQuiz()
      expect(dialog().open).toBe(false)

      await clickTake()

      expect(dialog().open).toBe(true)
      expect(take).not.toHaveBeenCalled()
      expect(navigateToMock).not.toHaveBeenCalled()
    })

    it('«Закрыть» закрывает окно, кнопка «Взять себе» снова работает', async () => {
      await mountQuiz()
      await clickTake()

      await wrapper.find('.library-login-dialog__close').trigger('click')
      await flushPromises()
      expect(dialog().open).toBe(false)

      await clickTake()
      expect(dialog().open).toBe(true)
    })

    it('«Войти» ведёт на вход с next на эту же страницу, «Зарегистрироваться» — без next', async () => {
      await mountQuiz('/library/quiz/12-stolitsy')

      const links = wrapper.findAll('dialog a')
      const login = links.find((link) => link.text() === 'Войти')
      const register = links.find((link) => link.text() === 'Зарегистрироваться')
      expect(login?.attributes('href')).toMatch(/^\/auth\/login\?/)
      expect(nextOfLogin()).toBe('/library/quiz/12-stolitsy')
      expect(register?.attributes('href')).toBe('/auth/register')
    })

    it('кириллический slug: next возвращает на ту же карточку', async () => {
      await mountQuiz('/library/quiz/12-столицы')

      expect(decodeURI(nextOfLogin() ?? '')).toBe('/library/quiz/12-столицы')
    })

    it('на английском: вход и регистрация с префиксом /en, next с /en', async () => {
      await mountQuiz('/en/library/quiz/12-capitals')

      const links = wrapper.findAll('dialog a')
      expect(links.find((link) => link.text() === 'Sign in')?.attributes('href')).toMatch(/^\/en\/auth\/login\?/)
      expect(nextOfLogin()).toBe('/en/library/quiz/12-capitals')
      expect(links.find((link) => link.text() === 'Create an account')?.attributes('href')).toBe('/en/auth/register')
    })
  })

  describe('вошедший учитель', () => {
    it('libraryApi.take(номер, токен), затем переход в редактор копии', async () => {
      useAuthStore().setSession(SESSION)
      const take = vi.spyOn(libraryApi, 'take').mockResolvedValue({ quizId: COPY_ID })
      await mountQuiz()

      await clickTake()

      expect(take).toHaveBeenCalledTimes(1)
      expect(take).toHaveBeenCalledWith(NUMBER, 'access-1')
      expect(navigateToMock).toHaveBeenCalledTimes(1)
      expect(navigateToMock).toHaveBeenCalledWith(`/teacher/quiz/${COPY_ID}`)
      expect(dialog().open).toBe(false)
    })

    it('на английском переход с префиксом /en', async () => {
      useAuthStore().setSession(SESSION)
      vi.spyOn(libraryApi, 'take').mockResolvedValue({ quizId: COPY_ID })
      await mountQuiz('/en/library/quiz/12-capitals')

      await clickTake()

      expect(navigateToMock).toHaveBeenCalledWith(`/en/teacher/quiz/${COPY_ID}`)
    })

    it('два быстрых клика: одно копирование и один переход', async () => {
      useAuthStore().setSession(SESSION)
      const take = vi.spyOn(libraryApi, 'take').mockResolvedValue({ quizId: COPY_ID })
      await mountQuiz()

      await takeButton().trigger('click')
      await takeButton().trigger('click')
      await flushPromises()

      expect(take).toHaveBeenCalledTimes(1)
      expect(navigateToMock).toHaveBeenCalledTimes(1)
    })

    it('признак входа и успешный refresh: кнопка ждёт проверки, затем копирует с новым токеном', async () => {
      localStorage.setItem(SIGNED_IN_HINT_KEY, '1')
      let finishRefresh: (value: typeof SESSION) => void = () => undefined
      refresh.mockReturnValue(new Promise((resolve) => (finishRefresh = resolve)))
      const take = vi.spyOn(libraryApi, 'take').mockResolvedValue({ quizId: COPY_ID })
      await mountQuiz()

      expect(takeButton().attributes('disabled')).toBeDefined()
      await clickTake()
      expect(take).not.toHaveBeenCalled()
      expect(dialog().open).toBe(false)

      finishRefresh(SESSION)
      await flushPromises()
      expect(takeButton().attributes('disabled')).toBeUndefined()

      await clickTake()
      expect(take).toHaveBeenCalledWith(NUMBER, 'access-1')
      expect(navigateToMock).toHaveBeenCalledWith(`/teacher/quiz/${COPY_ID}`)
    })
  })

  describe('кнопка не зависает выключенной', () => {
    it('refresh завершился сетевой ошибкой: статус unknown, кнопка включена и ведёт в окно входа', async () => {
      localStorage.setItem(SIGNED_IN_HINT_KEY, '1')
      let failRefresh: (error: unknown) => void = () => undefined
      refresh.mockReturnValue(new Promise((_, reject) => (failRefresh = reject)))
      await mountQuiz()
      expect(takeButton().attributes('disabled')).toBeDefined()

      failRefresh(new ApiError(0))
      await flushPromises()

      expect(useAuthStore().status).toBe('unknown')
      expect(takeButton().attributes('disabled')).toBeUndefined()
      await clickTake()
      expect(dialog().open).toBe(true)
      expect(navigateToMock).not.toHaveBeenCalled()
    })

    it('refresh упал не ApiError-ом: кнопка всё равно включается', async () => {
      localStorage.setItem(SIGNED_IN_HINT_KEY, '1')
      refresh.mockRejectedValue(new Error('boom'))

      await mountQuiz()

      expect(takeButton().attributes('disabled')).toBeUndefined()
    })

    it('refresh отказал с 401: гость, кнопка включена, клик открывает окно', async () => {
      localStorage.setItem(SIGNED_IN_HINT_KEY, '1')
      refresh.mockRejectedValue(new ApiError(401))
      await mountQuiz()

      expect(takeButton().attributes('disabled')).toBeUndefined()
      await clickTake()

      expect(dialog().open).toBe(true)
    })
  })

  describe('сессия потеряна во время копирования', () => {
    it('401 и отказ refresh: окно входа, без сообщения об ошибке и без перехода', async () => {
      useAuthStore().setSession(SESSION)
      refresh.mockRejectedValue(new ApiError(401))
      const take = vi.spyOn(libraryApi, 'take').mockRejectedValue(new ApiError(401))
      await mountQuiz()

      await clickTake()

      expect(take).toHaveBeenCalledTimes(1)
      expect(dialog().open).toBe(true)
      expect(wrapper.find('.library-quiz__actions [role="alert"]').exists()).toBe(false)
      expect(navigateToMock).not.toHaveBeenCalled()
    })

    it('401, затем успешный refresh: один повтор с новым токеном и переход', async () => {
      useAuthStore().setSession(SESSION)
      refresh.mockResolvedValue(REFRESHED_SESSION)
      const take = vi
        .spyOn(libraryApi, 'take')
        .mockRejectedValueOnce(new ApiError(401))
        .mockResolvedValueOnce({ quizId: COPY_ID })
      await mountQuiz()

      await clickTake()

      expect(take.mock.calls).toEqual([
        [NUMBER, 'access-1'],
        [NUMBER, 'access-2'],
      ])
      expect(navigateToMock).toHaveBeenCalledWith(`/teacher/quiz/${COPY_ID}`)
      expect(dialog().open).toBe(false)
    })
  })

  describe('ошибки копирования', () => {
    it.each([
      [409, 'Достигнут лимит'],
      [503, 'Не получилось скопировать картинки'],
    ])('статус %i: сообщение рядом с кнопкой, редактор не открывается, окно входа закрыто', async (code, text) => {
      useAuthStore().setSession(SESSION)
      vi.spyOn(libraryApi, 'take').mockRejectedValue(new ApiError(code))
      await mountQuiz()

      await clickTake()

      expect(wrapper.find('.library-quiz__actions [role="alert"]').text()).toContain(text)
      expect(navigateToMock).not.toHaveBeenCalled()
      expect(dialog().open).toBe(false)
      expect(takeButton().attributes('disabled')).toBeUndefined()
    })

    it('после 503 повторное нажатие копирует и ведёт в редактор', async () => {
      useAuthStore().setSession(SESSION)
      vi.spyOn(libraryApi, 'take')
        .mockRejectedValueOnce(new ApiError(503))
        .mockResolvedValueOnce({ quizId: COPY_ID })
      await mountQuiz()

      await clickTake()
      expect(navigateToMock).not.toHaveBeenCalled()
      await clickTake()

      expect(navigateToMock).toHaveBeenCalledWith(`/teacher/quiz/${COPY_ID}`)
      expect(wrapper.find('.library-quiz__actions [role="alert"]').exists()).toBe(false)
    })
  })
})
