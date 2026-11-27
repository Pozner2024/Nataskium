import { mountSuspended } from '@nuxt/test-utils/runtime'
import { flushPromises } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { clearError, clearNuxtState, useError } from '#imports'
import { libraryApi } from '@/entities/library'
import GameTypePage from './GameTypePage.vue'

const NOT_FOUND_CODE = 404

beforeEach(() => {
  clearNuxtState('library-groups')
  vi.spyOn(libraryApi, 'groups').mockResolvedValue({ groups: [] })
  vi.spyOn(libraryApi, 'list').mockResolvedValue({ quizzes: [], page: 1, hasNext: false })
})

afterEach(async () => {
  vi.restoreAllMocks()
  await clearError()
})

describe('GameTypePage', () => {
  it('«да/нет»: название, пояснение и кнопка «Создать» ведут в редактор этого типа', async () => {
    const wrapper = await mountSuspended(GameTypePage, { props: { slug: 'true-false' } })
    await flushPromises()

    expect(wrapper.get('h1').text()).toBe('Да/нет')
    expect(wrapper.get('.game-type-page__about').text()).toContain('утверждение')
    const create = wrapper.get('a.game-type-page__create')
    expect(create.text()).toContain('Создать задание')
    expect(create.attributes('href')).toBe('/teacher/true-false/new')
  })

  it('кнопка «Создать» в английской версии — с префиксом языка', async () => {
    const wrapper = await mountSuspended(GameTypePage, { props: { slug: 'true-false' }, route: '/en/games/true-false' })
    await flushPromises()

    expect(wrapper.get('a.game-type-page__create').attributes('href')).toBe('/en/teacher/true-false/new')
  })

  it('примеры — задания только этого типа, без раздела; пусто — текст, кнопка на месте', async () => {
    const wrapper = await mountSuspended(GameTypePage, { props: { slug: 'matching' } })
    await flushPromises()

    expect(libraryApi.list).toHaveBeenCalledWith({ group: null, q: null, page: 1, type: 'matching' })
    expect(wrapper.find('form[role="search"]').exists()).toBe(false)
    expect(wrapper.get('.library-browser__empty').text()).toBe('Готовых заданий в этой игре пока нет.')
    expect(wrapper.find('a.game-type-page__create').exists()).toBe(true)
  })

  // Nuxt перехватывает ошибку из setup и кладёт её в общее состояние ошибки: по нему же сервер выбирает HTTP-статус
  it.each(['gaps', 'truefalse', '', 'Quiz'])('неизвестный адрес «%s» — ошибка 404', async (slug) => {
    await mountSuspended(GameTypePage, { props: { slug } })

    expect(useError().value).toMatchObject({ statusCode: NOT_FOUND_CODE })
  })

  it('SPA-переход с известного типа на неизвестный выставляет ошибку 404', async () => {
    const wrapper = await mountSuspended(GameTypePage, { props: { slug: 'matching' } })
    await flushPromises()
    expect(useError().value).toBeFalsy()

    await wrapper.setProps({ slug: 'unknown-game' })
    await flushPromises()

    expect(useError().value).toMatchObject({ statusCode: NOT_FOUND_CODE })
  })
})
