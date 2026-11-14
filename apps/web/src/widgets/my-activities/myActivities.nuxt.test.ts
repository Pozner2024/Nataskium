import { mountSuspended, mockNuxtImport } from '@nuxt/test-utils/runtime'
import { flushPromises } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useAuthStore } from '@/features/auth'
import { quizApi } from '@/entities/quiz'
import TeacherActivitiesPage from '@/pages/TeacherActivitiesPage.vue'

const { navigateToMock } = vi.hoisted(() => ({ navigateToMock: vi.fn() }))
mockNuxtImport('navigateTo', () => navigateToMock)

const TEACHER = { id: 't1', email: 'qa-anna@example.test', displayName: 'Анна', hasPassword: true, hasGoogle: false }
const QUIZZES = [
  { id: 'q1', title: 'Столицы', questionCount: 3, gradingScale: null, shareToken: 'tok-1' },
  { id: 'q2', title: 'Дроби', questionCount: 5, gradingScale: null, shareToken: 'tok-2' },
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

    await wrapper.find('.teacher-activities-page__confirm').trigger('click')
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
    await wrapper.find('.teacher-activities-page__confirm').trigger('click')
    await flushPromises()

    expect(wrapper.findAll('.my-activities__list > li')).toHaveLength(2)
    expect(wrapper.find('.teacher-activities-page__error[role="alert"]').exists()).toBe(true)
  })

  it('повторная загрузка сбрасывает старую ошибку удаления', async () => {
    const list = vi.spyOn(quizApi, 'list').mockResolvedValue({ quizzes: QUIZZES })
    vi.spyOn(quizApi, 'remove').mockRejectedValue(new Error('network'))
    const wrapper = await mountPage()
    await wrapper.findComponent({ name: 'MyActivities' }).vm.$emit('delete', { ...QUIZZES[0], type: 'quiz' })
    await wrapper.find('.teacher-activities-page__confirm').trigger('click')
    await flushPromises()

    list.mockRejectedValue(new Error('network'))
    await wrapper.findComponent({ name: 'MyActivities' }).vm.$emit('retry')
    await flushPromises()

    expect(wrapper.find('.teacher-activities-page__error').exists()).toBe(false)
  })

  it('два быстрых подтверждения — один запрос удаления', async () => {
    vi.spyOn(quizApi, 'list').mockResolvedValue({ quizzes: QUIZZES })
    const remove = vi.spyOn(quizApi, 'remove').mockImplementation(() => new Promise(() => {}))
    const wrapper = await mountPage()

    await wrapper.findComponent({ name: 'MyActivities' }).vm.$emit('delete', { ...QUIZZES[0], type: 'quiz' })
    const confirm = wrapper.find('.teacher-activities-page__confirm')
    await confirm.trigger('click')
    await confirm.trigger('click')
    await flushPromises()

    expect(remove).toHaveBeenCalledTimes(1)
  })
})
