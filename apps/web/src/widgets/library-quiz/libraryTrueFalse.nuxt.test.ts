import { mockNuxtImport, mountSuspended } from '@nuxt/test-utils/runtime'
import { flushPromises, type VueWrapper } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { clearNuxtState, useRouter } from '#imports'
import { type LibraryQuizResponse, libraryApi } from '@/entities/library'
import { useAuthStore } from '@/features/auth'
import LibraryQuiz from './LibraryQuiz.vue'

const { navigateToMock } = vi.hoisted(() => ({ navigateToMock: vi.fn() }))
mockNuxtImport('navigateTo', () => navigateToMock)

const NUMBER = 31
const COPY_ID = '2d3e4f5a-6b7c-4d8e-9f0a-1b2c3d4e5f6a'
const TEACHER = { id: '6f1c2a4e-8d3b-4f5a-9c7e-1b2d3e4f5a6b', email: 'qa-anna@example.test', displayName: 'Анна', hasPassword: true, hasGoogle: false }
const STATEMENTS = Array.from({ length: 7 }, (_, i) => `Утверждение ${i + 1}`)

const TRUE_FALSE_BODY: LibraryQuizResponse = {
  quiz: {
    type: 'truefalse',
    number: NUMBER,
    title: 'Планеты',
    groupSlug: 'other',
    questionCount: STATEMENTS.length,
    graded: true,
    createdAt: '2026-11-15T10:00:00.000Z',
    statements: STATEMENTS,
  },
}

let wrapper: VueWrapper

async function mountCard() {
  wrapper = await mountSuspended(LibraryQuiz, { props: { number: NUMBER }, attachTo: document.body })
  await flushPromises()
}

beforeEach(() => {
  clearNuxtState('library-groups')
  navigateToMock.mockReset()
  localStorage.clear()
  useAuthStore().$patch({ accessToken: null, teacher: null, status: 'unknown' })
  vi.spyOn(libraryApi, 'groups').mockResolvedValue({ groups: [] })
  vi.spyOn(libraryApi, 'get').mockResolvedValue(TRUE_FALSE_BODY)
})

afterEach(async () => {
  wrapper.unmount()
  vi.restoreAllMocks()
  await useRouter().push('/')
})

describe('LibraryQuiz: карточка «да/нет»', () => {
  it('показывает все утверждения по порядку без ответов', async () => {
    await mountCard()

    expect(wrapper.find('.library-quiz__type').text()).toBe('Да/нет')
    expect(wrapper.find('.library-quiz__meta').text()).toMatch(/^Утверждений: 7 · Добавлено /)
    const items = wrapper.findAll('.library-true-false-preview__statement')
    expect(items.map((item) => item.find('.library-true-false-preview__number').text())).toEqual(['1', '2', '3', '4', '5', '6', '7'])
    expect(items.map((item) => item.find('.library-true-false-preview__text').text())).toEqual(STATEMENTS)
    expect(wrapper.find('.library-quiz__questions').exists()).toBe(false)
    expect(wrapper.find('.library-quiz__preview-title').text()).toBe('Утверждения')
  })

  it('кнопка «Взять себе» ведёт в /teacher/true-false/<id>', async () => {
    useAuthStore().setSession({ accessToken: 'access-1', teacher: TEACHER })
    const take = vi.spyOn(libraryApi, 'take').mockResolvedValue({ quizId: COPY_ID, type: 'truefalse' })
    await mountCard()

    await wrapper.find('.library-quiz__actions button.app-button').trigger('click')
    await flushPromises()

    expect(take).toHaveBeenCalledWith(NUMBER, 'access-1')
    expect(navigateToMock).toHaveBeenCalledWith(`/teacher/true-false/${COPY_ID}`)
  })
})
