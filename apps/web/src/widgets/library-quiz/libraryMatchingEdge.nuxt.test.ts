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

const NUMBER = 33
const COPY_ID = '2d3e4f5a-6b7c-4d8e-9f0a-1b2c3d4e5f60'
const TEACHER = { id: '6f1c2a4e-8d3b-4f5a-9c7e-1b2d3e4f5a6b', email: 'qa-anna@example.test', displayName: 'Анна', hasPassword: true, hasGoogle: false }
const TEN = 10
const LONG_TERM = 'т'.repeat(60)
const LONG_DEFINITION = 'о'.repeat(200)
const HTML_LIKE = '<b>x</b>'

const matchingBody = (definitions: string[], terms: string[]): LibraryQuizResponse => ({
  quiz: {
    type: 'matching',
    number: NUMBER,
    title: 'Пары',
    groupSlug: 'other',
    questionCount: definitions.length,
    graded: false,
    createdAt: '2026-11-15T10:00:00.000Z',
    definitions,
    terms,
  },
})

const QUIZ_BODY: LibraryQuizResponse = {
  quiz: {
    type: 'quiz' as const,
    number: NUMBER,
    title: 'Столицы',
    groupSlug: 'geography',
    questionCount: 1,
    graded: false,
    createdAt: '2026-11-15T10:00:00.000Z',
    questions: [{ text: 'Столица Франции?', imageUrl: null, options: [{ text: 'Париж', imageUrl: null }] }],
  },
}

let wrapper: VueWrapper

async function mountCard() {
  wrapper = await mountSuspended(LibraryQuiz, { props: { number: NUMBER }, attachTo: document.body })
  await flushPromises()
}

function takeButton() {
  return wrapper.find('.library-quiz__actions button.app-button')
}

beforeEach(() => {
  clearNuxtState('library-groups')
  navigateToMock.mockReset()
  localStorage.clear()
  useAuthStore().$patch({ accessToken: null, teacher: null, status: 'unknown' })
  vi.spyOn(libraryApi, 'groups').mockResolvedValue({ groups: [] })
})

afterEach(async () => {
  wrapper.unmount()
  vi.restoreAllMocks()
  await useRouter().push('/')
})

describe('LibraryQuiz: сопоставление — размеры и разметка', () => {
  it('10 пар: все определения с номерами 1–10 и все слова, без ограничения', async () => {
    const definitions = Array.from({ length: TEN }, (_, i) => `Определение ${i + 1}`)
    const terms = Array.from({ length: TEN }, (_, i) => `Слово ${i + 1}`)
    vi.spyOn(libraryApi, 'get').mockResolvedValue(matchingBody(definitions, terms))
    await mountCard()

    const items = wrapper.findAll('.library-matching-preview__definition')
    expect(items.map((item) => item.find('.library-matching-preview__number').text())).toEqual(definitions.map((_, i) => String(i + 1)))
    expect(items.map((item) => item.find('.library-matching-preview__definition-text').text())).toEqual(definitions)
    expect(wrapper.findAll('.library-matching-preview__term').map((chip) => chip.text())).toEqual(terms)
  })

  it('HTML-подобная строка в определении и слове выводится буквально, элементов <b> не появляется', async () => {
    vi.spyOn(libraryApi, 'get').mockResolvedValue(matchingBody([HTML_LIKE], [HTML_LIKE]))
    await mountCard()

    expect(wrapper.find('.library-matching-preview__definition-text').text()).toBe(HTML_LIKE)
    expect(wrapper.find('.library-matching-preview__term').text()).toBe(HTML_LIKE)
    expect(wrapper.find('.library-matching-preview b').exists()).toBe(false)
  })

  it('слово 60 символов и определение 200 символов выводятся целиком, без обрезки', async () => {
    vi.spyOn(libraryApi, 'get').mockResolvedValue(matchingBody([LONG_DEFINITION], [LONG_TERM]))
    await mountCard()

    expect(wrapper.find('.library-matching-preview__definition-text').text()).toBe(LONG_DEFINITION)
    expect(wrapper.find('.library-matching-preview__term').text()).toBe(LONG_TERM)
  })
})

describe('LibraryQuiz: «Взять себе» по типу', () => {
  it('викторина: переход в редактор викторины /teacher/quiz/<id>', async () => {
    vi.spyOn(libraryApi, 'get').mockResolvedValue(QUIZ_BODY)
    useAuthStore().setSession({ accessToken: 'access-1', teacher: TEACHER })
    const take = vi.spyOn(libraryApi, 'take').mockResolvedValue({ quizId: COPY_ID, type: 'quiz' })
    await mountCard()

    await takeButton().trigger('click')
    await flushPromises()

    expect(take).toHaveBeenCalledWith(NUMBER, 'access-1')
    expect(navigateToMock).toHaveBeenCalledWith(`/teacher/quiz/${COPY_ID}`)
  })

  it('гость на сопоставлении: окно входа, «Взять себе» не вызывается, перехода нет', async () => {
    vi.spyOn(libraryApi, 'get').mockResolvedValue(matchingBody(['A', 'B'], ['a', 'b']))
    vi.spyOn(authApi, 'refresh').mockRejectedValue(new ApiError(401))
    const take = vi.spyOn(libraryApi, 'take')
    await mountCard()

    await takeButton().trigger('click')
    await flushPromises()

    expect((wrapper.find('dialog').element as HTMLDialogElement).open).toBe(true)
    expect(take).not.toHaveBeenCalled()
    expect(navigateToMock).not.toHaveBeenCalled()
  })
})
