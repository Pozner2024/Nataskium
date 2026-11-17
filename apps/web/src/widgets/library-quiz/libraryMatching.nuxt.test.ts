import { mockNuxtImport, mountSuspended } from '@nuxt/test-utils/runtime'
import { flushPromises, type VueWrapper } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { clearNuxtState, useRouter } from '#imports'
import { type LibraryQuizResponse, libraryApi } from '@/entities/library'
import { useAuthStore } from '@/features/auth'
import LibraryQuiz from './LibraryQuiz.vue'

const { navigateToMock } = vi.hoisted(() => ({ navigateToMock: vi.fn() }))
mockNuxtImport('navigateTo', () => navigateToMock)

const NUMBER = 21
const COPY_ID = '1c2d3e4f-5a6b-4c7d-8e9f-0a1b2c3d4e5f'
const TEACHER = { id: '6f1c2a4e-8d3b-4f5a-9c7e-1b2d3e4f5a6b', email: 'qa-anna@example.test', displayName: 'Анна', hasPassword: true, hasGoogle: false }
const DEFINITIONS = Array.from({ length: 7 }, (_, i) => `Определение ${i + 1}`)
// Порядок сервера: виджет его не меняет и со словами определения не связывает
const TERMS = ['ж', 'в', 'а', 'д', 'б', 'е', 'г']

const MATCHING_BODY: LibraryQuizResponse = {
  quiz: {
    type: 'matching',
    number: NUMBER,
    title: 'Животные',
    groupSlug: 'other',
    questionCount: DEFINITIONS.length,
    graded: true,
    createdAt: '2026-11-15T10:00:00.000Z',
    definitions: DEFINITIONS,
    terms: TERMS,
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
  vi.spyOn(libraryApi, 'get').mockResolvedValue(MATCHING_BODY)
})

afterEach(async () => {
  wrapper.unmount()
  vi.restoreAllMocks()
  await useRouter().push('/')
})

describe('LibraryQuiz: карточка сопоставления', () => {
  it('тип и число пар в сводке', async () => {
    await mountCard()

    expect(wrapper.find('.library-quiz__type').text()).toBe('Сопоставление')
    expect(wrapper.find('.library-quiz__meta').text()).toMatch(/^Пары: 7 · Добавлено /)
  })

  it('все определения по порядку с номерами — без ограничения в 5', async () => {
    await mountCard()

    const items = wrapper.findAll('.library-matching-preview__definition')
    expect(items.map((item) => item.find('.library-matching-preview__number').text())).toEqual(['1', '2', '3', '4', '5', '6', '7'])
    expect(items.map((item) => item.find('.library-matching-preview__definition-text').text())).toEqual(DEFINITIONS)
  })

  it('все слова чипами в порядке сервера; превью вопросов викторины нет', async () => {
    await mountCard()

    expect(wrapper.findAll('.library-matching-preview__term').map((chip) => chip.text())).toEqual(TERMS)
    expect(wrapper.find('.library-quiz__questions').exists()).toBe(false)
    expect(wrapper.find('.library-quiz__preview-title').text()).toBe('Пары')
  })

  it('«Взять себе»: переход в редактор сопоставления по type из ответа', async () => {
    useAuthStore().setSession({ accessToken: 'access-1', teacher: TEACHER })
    const take = vi.spyOn(libraryApi, 'take').mockResolvedValue({ quizId: COPY_ID, type: 'matching' })
    await mountCard()

    await wrapper.find('.library-quiz__actions button.app-button').trigger('click')
    await flushPromises()

    expect(take).toHaveBeenCalledWith(NUMBER, 'access-1')
    expect(navigateToMock).toHaveBeenCalledWith(`/teacher/matching/${COPY_ID}`)
  })
})
