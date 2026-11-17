import { mockNuxtImport, mountSuspended } from '@nuxt/test-utils/runtime'
import { flushPromises, type VueWrapper } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { matchingApi } from '@/entities/matching'
import { useAuthStore } from '@/features/auth'
import { ApiError } from '@/shared'
import MatchingEditor from './MatchingEditor.vue'
import { useMatchingEditorStore } from './store'

const { navigateToMock } = vi.hoisted(() => ({ navigateToMock: vi.fn() }))
mockNuxtImport('navigateTo', () => navigateToMock)

const TEACHER = { id: 't1', email: 'qa-anna@example.test', displayName: 'Анна', hasPassword: true, hasGoogle: false }
const ID = '6f1c2a4e-8d3b-4f5a-9c7e-1b2d3e4f5a6b'
const SHARE_TOKEN = 'abcdefghijklmnopqrstuv'
const ONE_PAIR_LIMIT = 2
const MAX_PAIRS = 10

const mounted: { unmount: () => void }[] = []

function fillTitleAndGroup(): void {
  const store = useMatchingEditorStore()
  store.matching.title = 'Клетка'
  store.matching.group = 'other'
}

// Копия: стор меняет массив пар (добавление, удаление), а общие константы тестов менять нельзя
function setPairs(pairs: { term: string; definition: string }[]): void {
  useMatchingEditorStore().matching.pairs = pairs.map((pair) => ({ ...pair }))
}

const VALID_PAIRS = [
  { term: 'Митоз', definition: 'Деление клетки' },
  { term: 'Ядро', definition: 'Хранит наследственную информацию' },
]

function saved(input: Parameters<typeof matchingApi.create>[0]) {
  return { matching: { ...input, id: ID, shareToken: SHARE_TOKEN, group: input.group, timer: input.timer } }
}

async function mountEditor(matchingId?: string) {
  const wrapper = await mountSuspended(MatchingEditor, { props: { matchingId } })
  mounted.push(wrapper)
  await flushPromises()
  return wrapper
}

async function submit(wrapper: VueWrapper): Promise<void> {
  await wrapper.find('.matching-editor__form').trigger('submit')
  await flushPromises()
}

beforeEach(() => {
  vi.restoreAllMocks()
  navigateToMock.mockReset()
  useAuthStore().setSession({ accessToken: 'access-1', teacher: TEACHER })
})

afterEach(() => {
  for (const wrapper of mounted.splice(0)) wrapper.unmount()
})

describe('Редактор сопоставления: границы пар', () => {
  it('2 пары: «Удалить» неактивна, видна подсказка #matching-min-pairs', async () => {
    const wrapper = await mountEditor()
    setPairs(VALID_PAIRS)
    await flushPromises()

    for (const button of wrapper.findAll('.pair-card__remove')) expect(button.attributes('disabled')).toBeDefined()
    expect(wrapper.find('#matching-min-pairs').exists()).toBe(true)
    expect(wrapper.findAll('.pair-card__remove')[0]!.attributes('aria-describedby')).toBe('matching-min-pairs')
  })

  it(`${MAX_PAIRS} пар: «+ Добавить пару» неактивна, видна подсказка #matching-max-pairs`, async () => {
    const wrapper = await mountEditor()
    setPairs(Array.from({ length: MAX_PAIRS }, (_, i) => ({ term: `слово ${i}`, definition: `определение ${i}` })))
    await flushPromises()

    expect(wrapper.find('.matching-editor__add').attributes('disabled')).toBeDefined()
    expect(wrapper.find('#matching-max-pairs').exists()).toBe(true)
  })

  it('удаление пары убирает её сразу, без диалога подтверждения', async () => {
    const wrapper = await mountEditor()
    setPairs([...VALID_PAIRS, { term: 'Хлоропласт', definition: 'Фотосинтез' }])
    await flushPromises()

    await wrapper.findAll('.pair-card__remove')[0]!.trigger('click')

    expect(useMatchingEditorStore().matching.pairs.map((pair) => pair.term)).toEqual(['Ядро', 'Хлоропласт'])
    expect(wrapper.find('[role="dialog"]').exists()).toBe(false)
  })

  it(`«+ Добавить пару» до ${MAX_PAIRS} добавляет пару и не выходит за максимум`, async () => {
    const wrapper = await mountEditor()
    setPairs(VALID_PAIRS)
    await flushPromises()

    await wrapper.find('.matching-editor__add').trigger('click')

    expect(useMatchingEditorStore().matching.pairs).toHaveLength(ONE_PAIR_LIMIT + 1)
    expect(useMatchingEditorStore().canAddPair).toBe(true)
  })
})

describe('Редактор сопоставления: ошибки полей', () => {
  it('пустое слово: aria-invalid и текст «Заполните это поле», фокус на поле', async () => {
    const wrapper = await mountEditor()
    fillTitleAndGroup()
    setPairs([{ term: '  ', definition: 'Деление клетки' }, VALID_PAIRS[1]!])
    await flushPromises()

    await submit(wrapper)

    const term = wrapper.find('#pair-0-term')
    expect(term.attributes('aria-invalid')).toBe('true')
    expect(wrapper.find('#pair-0-term-error').text()).toBe('Заполните это поле')
  })

  it('после «Сохранить» с ошибкой фокус на первом невалидном поле', async () => {
    const wrapper = await mountSuspended(MatchingEditor, { props: {}, attachTo: document.body })
    mounted.push(wrapper)
    await flushPromises()
    fillTitleAndGroup()
    setPairs([{ term: '', definition: 'Деление клетки' }, VALID_PAIRS[1]!])
    await flushPromises()

    await submit(wrapper)

    expect(document.activeElement?.id).toBe('pair-0-term')
  })

  it('дубль: ошибка в обеих карточках с номером другой пары; сводка «в парах: 1, 2»', async () => {
    const wrapper = await mountEditor()
    fillTitleAndGroup()
    setPairs([
      { term: 'Митоз', definition: 'Деление клетки' },
      { term: ' митоз ', definition: 'Другое определение' },
    ])
    await flushPromises()

    await submit(wrapper)

    expect(wrapper.find('#pair-0-term-error').text()).toBe('Такое слово уже есть в паре 2')
    expect(wrapper.find('#pair-1-term-error').text()).toBe('Такое слово уже есть в паре 1')
    expect(wrapper.find('#pair-0-term').attributes('aria-invalid')).toBe('true')
    expect(wrapper.find('#pair-1-term').attributes('aria-invalid')).toBe('true')
    expect(wrapper.find('.matching-editor__error-text').text()).toBe('Исправьте отмеченные поля в парах: 1, 2')
  })

  it('400 с issues от сервера: текст у поля пары по пути pairs.N.term', async () => {
    const wrapper = await mountEditor()
    fillTitleAndGroup()
    setPairs(VALID_PAIRS)
    await flushPromises()
    vi.spyOn(matchingApi, 'create').mockRejectedValue(new ApiError(400, [{ path: ['pairs', 1, 'term'], message: 'Text is required' }] as never))

    await submit(wrapper)

    expect(wrapper.find('#pair-1-term-error').text()).toBe('Заполните это поле')
  })

  it('409 при создании — текст о лимите заданий', async () => {
    const wrapper = await mountEditor()
    fillTitleAndGroup()
    setPairs(VALID_PAIRS)
    await flushPromises()
    vi.spyOn(matchingApi, 'create').mockRejectedValue(new ApiError(409))

    await submit(wrapper)

    expect(wrapper.find('.matching-editor__error-text').text()).toContain('Достигнут лимит: не больше 100 заданий')
  })

  it('сетевая ошибка при сохранении — «Не получилось сохранить»', async () => {
    const wrapper = await mountEditor()
    fillTitleAndGroup()
    setPairs(VALID_PAIRS)
    await flushPromises()
    vi.spyOn(matchingApi, 'create').mockRejectedValue(new TypeError('Failed to fetch'))

    await submit(wrapper)

    expect(wrapper.find('.matching-editor__error-text').text()).toBe('Не получилось сохранить. Попробуйте ещё раз.')
  })
})

describe('Редактор сопоставления: создание и загрузка', () => {
  it('создание → navigateTo на /teacher/matching/<id> с replace, без повторного matchingApi.get', async () => {
    vi.spyOn(matchingApi, 'create').mockImplementation(async (input) => saved(input))
    const get = vi.spyOn(matchingApi, 'get')
    const wrapper = await mountEditor()
    fillTitleAndGroup()
    setPairs(VALID_PAIRS)
    await flushPromises()

    await submit(wrapper)

    expect(navigateToMock).toHaveBeenCalledTimes(1)
    expect(navigateToMock.mock.calls[0]?.[0]).toMatch(new RegExp(`/teacher/matching/${ID}$`))
    expect(navigateToMock.mock.calls[0]?.[1]).toEqual({ replace: true })
    expect(get).not.toHaveBeenCalled()
  })

  it('404 при загрузке — «Задание не найдено»', async () => {
    vi.spyOn(matchingApi, 'get').mockRejectedValue(new ApiError(404))

    const wrapper = await mountEditor(ID)

    expect(wrapper.find('[role="alert"]').text()).toBe('Задание не найдено')
  })

  it('размонтирование без создания сбрасывает store: следующий заход пустой', async () => {
    const wrapper = await mountEditor()
    fillTitleAndGroup()
    await flushPromises()
    expect(useMatchingEditorStore().matching.title).toBe('Клетка')

    wrapper.unmount()
    mounted.splice(0)

    expect(useMatchingEditorStore().matching.title).toBe('')
    expect(useMatchingEditorStore().id).toBeNull()
  })
})

describe('Редактор сопоставления: несохранённые изменения', () => {
  it('правка без сохранения показывает «Есть несохранённые изменения»', async () => {
    const wrapper = await mountEditor()
    fillTitleAndGroup()
    await flushPromises()

    expect(wrapper.find('.matching-editor__unsaved').exists()).toBe(true)
  })
})

describe('Редактор сопоставления: откат настроек', () => {
  it('неудачное сохранение переключателя «показывать ответы» возвращает прежнее значение в store', async () => {
    vi.spyOn(matchingApi, 'create').mockImplementation(async (input) => saved(input))
    const wrapper = await mountEditor()
    fillTitleAndGroup()
    setPairs(VALID_PAIRS)
    await flushPromises()
    // Первое сохранение создаёт задание и открывает настройки; дальше настройки идут через update
    await wrapper.find('.matching-editor__settings').trigger('click')
    await flushPromises()
    const store = useMatchingEditorStore()
    expect(store.view).toBe('settings')
    vi.spyOn(matchingApi, 'update').mockRejectedValue(new ApiError(500))

    const checkbox = wrapper.find<HTMLInputElement>('#quiz-show-answers')
    await checkbox.setValue(false)
    await flushPromises()

    expect(store.matching.showAnswers).toBe(true)
    expect(checkbox.element.checked).toBe(true)
  })
})
