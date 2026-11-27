import { mountSuspended, mockNuxtImport } from '@nuxt/test-utils/runtime'
import { flushPromises } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useAuthStore } from '@/features/auth'
import { matchingApi } from '@/entities/matching'
import { quizApi } from '@/entities/quiz'
import { trueFalseApi } from '@/entities/true-false'
import TeacherActivitiesPage from '@/pages/TeacherActivitiesPage.vue'

const { navigateToMock } = vi.hoisted(() => ({ navigateToMock: vi.fn() }))
mockNuxtImport('navigateTo', () => navigateToMock)

const TEACHER = { id: 't1', email: 'qa-anna@example.test', displayName: 'Анна', hasPassword: true, hasGoogle: false }
const QUIZZES = [
  { id: 'q1', type: 'quiz' as const, title: 'Столицы', questionCount: 3, gradingScale: null, shareToken: 'tok-1', introTheme: 'nataskium-night' as const, thumbnail: null },
  { id: 'q2', type: 'quiz' as const, title: 'Дроби', questionCount: 5, gradingScale: null, shareToken: 'tok-2', introTheme: 'nataskium-night' as const, thumbnail: null },
]

beforeEach(() => {
  vi.restoreAllMocks()
  navigateToMock.mockReset()
  useAuthStore().setSession({ accessToken: 'access-1', teacher: TEACHER })
})

async function mountPage() {
  const wrapper = await mountSuspended(TeacherActivitiesPage)
  await flushPromises()
  return wrapper
}

describe('Мои задания', () => {
  it('показывает викторины из API', async () => {
    const list = vi.spyOn(quizApi, 'list').mockResolvedValue({ quizzes: QUIZZES })
    const wrapper = await mountPage()

    expect(list).toHaveBeenCalledWith('access-1')
    expect(wrapper.text()).toContain('Столицы')
    expect(wrapper.text()).toContain('Дроби')
  })

  it('пустой ответ — пустое состояние', async () => {
    vi.spyOn(quizApi, 'list').mockResolvedValue({ quizzes: [] })
    const wrapper = await mountPage()

    expect(wrapper.text()).toContain('Здесь появятся ваши задания')
  })

  it('ошибка загрузки — сообщение и «Повторить», повтор грузит заново', async () => {
    const list = vi.spyOn(quizApi, 'list').mockRejectedValueOnce(new Error('network'))
    const wrapper = await mountPage()

    expect(wrapper.find('[role="alert"]').exists()).toBe(true)
    list.mockResolvedValue({ quizzes: QUIZZES })
    await wrapper.find('.my-activities__retry').trigger('click')
    await flushPromises()

    expect(list).toHaveBeenCalledTimes(2)
    expect(wrapper.text()).toContain('Столицы')
  })

  it('удаление: подтверждение, затем карточка исчезает', async () => {
    vi.spyOn(quizApi, 'list').mockResolvedValue({ quizzes: QUIZZES })
    const remove = vi.spyOn(quizApi, 'remove').mockResolvedValue(undefined)
    const wrapper = await mountPage()

    await wrapper.findComponent({ name: 'MyActivities' }).vm.$emit('delete', { ...QUIZZES[0], type: 'quiz' })
    await flushPromises()
    expect(remove).not.toHaveBeenCalled()

    await wrapper.find('.app-confirm-dialog__confirm').trigger('click')
    await flushPromises()

    expect(remove).toHaveBeenCalledWith('q1', 'access-1')
    const items = wrapper.findAll('.my-activities__list > li')
    expect(items).toHaveLength(1)
    expect(items[0]?.text()).toContain('Дроби')
  })

  it('«Изменить» ведёт на редактор викторины', async () => {
    vi.spyOn(quizApi, 'list').mockResolvedValue({ quizzes: QUIZZES })
    const wrapper = await mountPage()

    await wrapper.findComponent({ name: 'MyActivities' }).vm.$emit('edit', { ...QUIZZES[1], type: 'quiz' })

    expect(navigateToMock).toHaveBeenCalledWith('/teacher/quiz/q2')
  })

  it('ошибка удаления — карточка остаётся, сообщение видно', async () => {
    vi.spyOn(quizApi, 'list').mockResolvedValue({ quizzes: QUIZZES })
    vi.spyOn(quizApi, 'remove').mockRejectedValue(new Error('network'))
    const wrapper = await mountPage()

    await wrapper.findComponent({ name: 'MyActivities' }).vm.$emit('delete', { ...QUIZZES[0], type: 'quiz' })
    await wrapper.find('.app-confirm-dialog__confirm').trigger('click')
    await flushPromises()

    expect(wrapper.findAll('.my-activities__list > li')).toHaveLength(2)
    expect(wrapper.find('.manage-activities__error[role="alert"]').exists()).toBe(true)
  })

  it('повторная загрузка сбрасывает старую ошибку удаления', async () => {
    const list = vi.spyOn(quizApi, 'list').mockResolvedValue({ quizzes: QUIZZES })
    vi.spyOn(quizApi, 'remove').mockRejectedValue(new Error('network'))
    const wrapper = await mountPage()
    await wrapper.findComponent({ name: 'MyActivities' }).vm.$emit('delete', { ...QUIZZES[0], type: 'quiz' })
    await wrapper.find('.app-confirm-dialog__confirm').trigger('click')
    await flushPromises()

    list.mockRejectedValue(new Error('network'))
    await wrapper.findComponent({ name: 'MyActivities' }).vm.$emit('retry')
    await flushPromises()

    expect(wrapper.find('.manage-activities__error').exists()).toBe(false)
  })

  it('два быстрых подтверждения — один запрос удаления', async () => {
    vi.spyOn(quizApi, 'list').mockResolvedValue({ quizzes: QUIZZES })
    const remove = vi.spyOn(quizApi, 'remove').mockImplementation(() => new Promise(() => {}))
    const wrapper = await mountPage()

    await wrapper.findComponent({ name: 'MyActivities' }).vm.$emit('delete', { ...QUIZZES[0], type: 'quiz' })
    const confirm = wrapper.find('.app-confirm-dialog__confirm')
    await confirm.trigger('click')
    await confirm.trigger('click')
    await flushPromises()

    expect(remove).toHaveBeenCalledTimes(1)
  })
})

describe('Мои задания: сопоставление', () => {
  const MATCHING = { id: 'm1', type: 'matching' as const, title: 'Животные', questionCount: 4, gradingScale: null, shareToken: 'tok-3', introTheme: 'nataskium-night' as const, thumbnail: null }

  it('карточка подписана типом и числом пар, у викторины — число вопросов', async () => {
    vi.spyOn(quizApi, 'list').mockResolvedValue({ quizzes: [QUIZZES[0]!, MATCHING] })
    const wrapper = await mountPage()

    const items = wrapper.findAll('.my-activities__list > li')
    expect(items[0]?.find('.activity-card__meta').text()).toBe('Викторина · Вопросов: 3')
    expect(items[1]?.find('.activity-card__meta').text()).toBe('Сопоставление · Пары: 4')
  })

  it('«Изменить» ведёт на редактор сопоставления', async () => {
    vi.spyOn(quizApi, 'list').mockResolvedValue({ quizzes: [MATCHING] })
    const wrapper = await mountPage()

    await wrapper.findComponent({ name: 'MyActivities' }).vm.$emit('edit', MATCHING)

    expect(navigateToMock).toHaveBeenCalledWith('/teacher/matching/m1')
  })

  it('удаление сопоставления идёт через matchingApi, а не quizApi', async () => {
    vi.spyOn(quizApi, 'list').mockResolvedValue({ quizzes: [QUIZZES[0]!, MATCHING] })
    const removeQuiz = vi.spyOn(quizApi, 'remove').mockResolvedValue(undefined)
    const removeMatching = vi.spyOn(matchingApi, 'remove').mockResolvedValue(undefined)
    const wrapper = await mountPage()

    await wrapper.findComponent({ name: 'MyActivities' }).vm.$emit('delete', MATCHING)
    await wrapper.find('.app-confirm-dialog__confirm').trigger('click')
    await flushPromises()

    expect(removeMatching).toHaveBeenCalledWith('m1', 'access-1')
    expect(removeQuiz).not.toHaveBeenCalled()
    const items = wrapper.findAll('.my-activities__list > li')
    expect(items).toHaveLength(1)
    expect(items[0]?.text()).toContain('Столицы')
  })
})

describe('Мои задания: да/нет', () => {
  const TRUE_FALSE = { id: 't1', type: 'truefalse' as const, title: 'Факты', questionCount: 5, gradingScale: null, shareToken: 'tok-4', introTheme: 'nataskium-night' as const, thumbnail: null }

  it('карточка подписана типом и числом утверждений', async () => {
    vi.spyOn(quizApi, 'list').mockResolvedValue({ quizzes: [TRUE_FALSE] })
    const wrapper = await mountPage()

    expect(wrapper.find('.activity-card__meta').text()).toBe('Да/нет · Утверждений: 5')
  })

  it('«Изменить» ведёт на редактор да/нет', async () => {
    vi.spyOn(quizApi, 'list').mockResolvedValue({ quizzes: [TRUE_FALSE] })
    const wrapper = await mountPage()

    await wrapper.findComponent({ name: 'MyActivities' }).vm.$emit('edit', TRUE_FALSE)

    expect(navigateToMock).toHaveBeenCalledWith('/teacher/true-false/t1')
  })

  it('удаление да/нет идёт через trueFalseApi, а не quizApi', async () => {
    vi.spyOn(quizApi, 'list').mockResolvedValue({ quizzes: [QUIZZES[0]!, TRUE_FALSE] })
    const removeQuiz = vi.spyOn(quizApi, 'remove').mockResolvedValue(undefined)
    const removeTrueFalse = vi.spyOn(trueFalseApi, 'remove').mockResolvedValue(undefined)
    const wrapper = await mountPage()

    await wrapper.findComponent({ name: 'MyActivities' }).vm.$emit('delete', TRUE_FALSE)
    await wrapper.find('.app-confirm-dialog__confirm').trigger('click')
    await flushPromises()

    expect(removeTrueFalse).toHaveBeenCalledWith('t1', 'access-1')
    expect(removeQuiz).not.toHaveBeenCalled()
  })

  it('ссылка на прохождение сохраняет локаль учителя и не содержит ?preview=1', async () => {
    vi.spyOn(quizApi, 'list').mockResolvedValue({ quizzes: [QUIZZES[0]!] })
    const wrapper = await mountSuspended(TeacherActivitiesPage, { route: '/en/teacher' })
    await flushPromises()

    expect(wrapper.get('.activity-card a').attributes('href')).toBe('/en/play/tok-1')
  })
})
