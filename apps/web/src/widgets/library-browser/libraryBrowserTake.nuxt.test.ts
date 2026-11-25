import { mockNuxtImport, mountSuspended } from '@nuxt/test-utils/runtime'
import { flushPromises, type VueWrapper } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { clearNuxtState, useRouter } from '#imports'
import { type LibraryListItem, libraryApi } from '@/entities/library'
import { restoreSession, useAuthStore } from '@/features/auth'
import { ApiError } from '@/shared'
import LibraryBrowser from './LibraryBrowser.vue'

const { navigateToMock } = vi.hoisted(() => ({ navigateToMock: vi.fn() }))
mockNuxtImport('navigateTo', () => navigateToMock)

// Проверка сессии подменена: кнопка проверяется для гостя и для учителя без запросов
vi.mock('@/features/auth', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/features/auth')>()),
  restoreSession: vi.fn(),
}))

const COPY_ID = '0b6a9c1e-7f3d-4a52-9e1b-3c5d7f9a1b2c'
const TEACHER = { id: 't1', email: 'qa-anna@example.test', displayName: 'Анна', hasPassword: true, hasGoogle: false }
const GROUPS = {
  groups: [{ slug: 'geography', names: { ru: 'География', en: 'Geography', de: 'Geografie', fr: 'Géographie' } }],
}

function summary(number: number, type: LibraryListItem['type'] = 'quiz'): LibraryListItem {
  return {
    number,
    type,
    title: `Задание ${number}`,
    groupSlug: 'geography',
    questionCount: 3,
    graded: false,
    createdAt: '2026-11-15T10:00:00.000Z',
    introTheme: 'nataskium-night',
    thumbnail: null,
  }
}

const LIST = [summary(12, 'quiz'), summary(7, 'matching'), summary(3, 'truefalse')]

let wrapper: VueWrapper

async function mountBrowser(route = '/library/geography?q=fr') {
  wrapper = await mountSuspended(LibraryBrowser, { props: { group: 'geography' }, route, attachTo: document.body })
  await flushPromises()
}

function takeButtons() {
  return wrapper.findAll('.library-browser__card .take-library-quiz-button__compact')
}

function signIn() {
  useAuthStore().setSession({ accessToken: 'access-1', teacher: TEACHER })
}

beforeEach(() => {
  clearNuxtState('library-groups')
  navigateToMock.mockReset()
  vi.mocked(restoreSession).mockResolvedValue(undefined)
  vi.spyOn(libraryApi, 'groups').mockResolvedValue(GROUPS)
  vi.spyOn(libraryApi, 'list').mockResolvedValue({ quizzes: LIST, page: 1, hasNext: false })
})

afterEach(async () => {
  wrapper.unmount()
  useAuthStore().clearSession()
  vi.restoreAllMocks()
  document.documentElement.classList.remove('is-scroll-locked')
  await useRouter().push('/')
})

describe('LibraryBrowser: «Взять себе» на карточке', () => {
  it('на каждой карточке своя кнопка «Взять себе», вне ссылки карточки', async () => {
    await mountBrowser()

    expect(takeButtons()).toHaveLength(LIST.length)
    for (const button of takeButtons()) {
      expect(button.text()).toBe('Взять себе')
      expect(button.element.closest('a')).toBeNull()
    }
  })

  it('пока сессия не проверена, кнопки выключены', async () => {
    vi.mocked(restoreSession).mockReturnValue(new Promise(() => {}))
    await mountBrowser()

    for (const button of takeButtons()) expect(button.attributes('disabled')).toBeDefined()
  })

  it('гость: клик открывает одно окно входа, next — текущий адрес раздела с поиском; перехода нет', async () => {
    const take = vi.spyOn(libraryApi, 'take')
    await mountBrowser()

    await takeButtons()[1]!.trigger('click')
    await flushPromises()

    expect(take).not.toHaveBeenCalled()
    expect(navigateToMock).not.toHaveBeenCalled()
    const dialogs = wrapper.findAll('dialog')
    expect(dialogs).toHaveLength(1)
    expect((dialogs[0]!.element as HTMLDialogElement).open).toBe(true)
    const login = wrapper.findAll('dialog a').find((link) => link.text() === 'Войти')!
    const next = new URL(login.attributes('href') ?? '', 'http://localhost').searchParams.get('next')
    expect(next).toBe('/library/geography?q=fr')
  })

  it.each([
    [0, 12, '/teacher/quiz'],
    [1, 7, '/teacher/matching'],
    [2, 3, '/teacher/true-false'],
  ])('учитель: карточка %i копирует номер %i и открывает редактор своего типа', async (index, number, editPrefix) => {
    signIn()
    const take = vi.spyOn(libraryApi, 'take').mockResolvedValue({ quizId: COPY_ID, type: LIST[index]!.type })
    await mountBrowser()

    await takeButtons()[index]!.trigger('click')
    await flushPromises()

    expect(take).toHaveBeenCalledTimes(1)
    expect(take).toHaveBeenCalledWith(number, 'access-1')
    expect(navigateToMock).toHaveBeenCalledTimes(1)
    expect(navigateToMock.mock.calls[0]?.[0]).toBe(`${editPrefix}/${COPY_ID}`)
  })

  it('два быстрых клика дают один POST', async () => {
    signIn()
    const take = vi.spyOn(libraryApi, 'take').mockReturnValue(new Promise(() => {}))
    await mountBrowser()

    await takeButtons()[0]!.trigger('click')
    await takeButtons()[0]!.trigger('click')
    await flushPromises()

    expect(take).toHaveBeenCalledTimes(1)
  })

  it('409: ошибка и ссылка «Мои задания» в этой карточке, остальные карточки без ошибок', async () => {
    signIn()
    vi.spyOn(libraryApi, 'take').mockRejectedValue(new ApiError(409))
    await mountBrowser()

    await takeButtons()[1]!.trigger('click')
    await flushPromises()

    const cards = wrapper.findAll('.library-browser__card')
    expect(cards[1]!.find('[role="alert"]').exists()).toBe(true)
    expect(cards[1]!.find('[role="alert"] a').attributes('href')).toBe('/teacher')
    expect(cards[0]!.find('[role="alert"]').exists()).toBe(false)
    expect(cards[2]!.find('[role="alert"]').exists()).toBe(false)
    expect(navigateToMock).not.toHaveBeenCalled()
  })
})
