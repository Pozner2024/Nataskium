import { mockNuxtImport, mountSuspended } from '@nuxt/test-utils/runtime'
import { flushPromises, type VueWrapper } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { trueFalseApi } from '@/entities/true-false'
import { useAuthStore } from '@/features/auth'
import { ApiError } from '@/shared'
import TrueFalseEditor from './TrueFalseEditor.vue'
import { useTrueFalseEditorStore } from './store'

const { navigateToMock } = vi.hoisted(() => ({ navigateToMock: vi.fn() }))
mockNuxtImport('navigateTo', () => navigateToMock)

const TEACHER = { id: 't1', email: 'qa-anna@example.test', displayName: 'Анна', hasPassword: true, hasGoogle: false }
const ID = '6f1c2a4e-8d3b-4f5a-9c7e-1b2d3e4f5a6b'
const SHARE_TOKEN = 'abcdefghijklmnopqrstuv'
const MAX_ITEMS = 30

const mounted: { unmount: () => void }[] = []

function fillTitleAndGroup(): void {
  const store = useTrueFalseEditorStore()
  store.trueFalse.title = 'Клетка'
  store.trueFalse.group = 'other'
}

// Копия: стор меняет массив (добавление, удаление), а общие константы тестов менять нельзя
function setItems(items: { statement: string; answer: boolean | null }[]): void {
  useTrueFalseEditorStore().trueFalse.items = items.map((item) => ({ ...item }))
}

const VALID_ITEMS = [
  { statement: 'Митоз — деление клетки', answer: true },
  { statement: 'Ядро есть у бактерий', answer: false },
]

function saved(input: Parameters<typeof trueFalseApi.create>[0]) {
  return { trueFalse: { ...input, id: ID, shareToken: SHARE_TOKEN, group: input.group, timer: input.timer } }
}

async function mountEditor(trueFalseId?: string, attachTo?: HTMLElement) {
  const wrapper = await mountSuspended(TrueFalseEditor, { props: { trueFalseId }, attachTo })
  mounted.push(wrapper)
  await flushPromises()
  return wrapper
}

async function submit(wrapper: VueWrapper): Promise<void> {
  await wrapper.find('.true-false-editor__form').trigger('submit')
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

describe('Редактор «да/нет»: карточки и границы', () => {
  it('рендерит карточки и переключатель Да/Нет, у каждой радиокнопки есть подпись', async () => {
    const wrapper = await mountEditor()
    setItems(VALID_ITEMS)
    await flushPromises()

    expect(wrapper.findAll('.statement-card')).toHaveLength(2)
    const radios = wrapper.findAll<HTMLInputElement>('.statement-card__radio')
    expect(radios).toHaveLength(4)
    for (const radio of radios) {
      expect(radio.element.labels?.[0]?.textContent?.trim()).toMatch(/^(Да|Нет)$/)
      expect(radio.element.labels?.[0]?.querySelector('svg')).not.toBeNull()
    }
    expect(radios[0]!.element.checked).toBe(true)
    expect(radios[3]!.element.checked).toBe(true)
  })

  it('пока ответа нет, ни одна радиокнопка не отмечена', async () => {
    const wrapper = await mountEditor()
    await flushPromises()

    const radios = wrapper.findAll<HTMLInputElement>('.statement-card__radio')
    expect(radios).toHaveLength(4)
    expect(radios.some((radio) => radio.element.checked)).toBe(false)
  })

  it('выбор «Нет» меняет ответ утверждения в store', async () => {
    const wrapper = await mountEditor()
    setItems(VALID_ITEMS)
    await flushPromises()

    await wrapper.findAll('.statement-card__radio')[1]!.setValue(true)

    expect(useTrueFalseEditorStore().items[0]!.answer).toBe(false)
  })

  it('2 утверждения: кнопки удаления скрыты, видна подсказка', async () => {
    const wrapper = await mountEditor()
    setItems(VALID_ITEMS)
    await flushPromises()

    expect(wrapper.find('.statement-card__remove').exists()).toBe(false)
    expect(wrapper.find('#true-false-min-items').exists()).toBe(true)
  })

  it('30 утверждений: кнопка «Добавить» скрыта, видна подсказка', async () => {
    const wrapper = await mountEditor()
    setItems(Array.from({ length: MAX_ITEMS }, (_, i) => ({ statement: `утверждение ${i}`, answer: true })))
    await flushPromises()

    expect(wrapper.find('.true-false-editor__add').exists()).toBe(false)
    expect(wrapper.find('#true-false-max-items').exists()).toBe(true)
    expect(wrapper.find('.statement-card__remove').exists()).toBe(true)
  })

  it('удаление убирает утверждение сразу, без диалога', async () => {
    const wrapper = await mountEditor()
    setItems([...VALID_ITEMS, { statement: 'Хлоропласт участвует в фотосинтезе', answer: true }])
    await flushPromises()

    await wrapper.findAll('.statement-card__remove')[0]!.trigger('click')

    expect(useTrueFalseEditorStore().items.map((item) => item.statement)).toEqual(['Ядро есть у бактерий', 'Хлоропласт участвует в фотосинтезе'])
    expect(wrapper.find('[role="dialog"]').exists()).toBe(false)
  })

  it('клик по «Добавить» добавляет карточку и переводит фокус в неё', async () => {
    const wrapper = await mountEditor(undefined, document.body)
    setItems(VALID_ITEMS)
    await flushPromises()

    await wrapper.find('.true-false-editor__add').trigger('click')
    await flushPromises()

    expect(useTrueFalseEditorStore().items).toHaveLength(3)
    expect(document.activeElement?.id).toBe('item-2-statement')
  })
})

describe('Редактор «да/нет»: ошибки полей', () => {
  it('ошибка поля связана через aria-describedby, фокус на первом невалидном поле', async () => {
    const wrapper = await mountEditor(undefined, document.body)
    fillTitleAndGroup()
    setItems([{ statement: '  ', answer: true }, VALID_ITEMS[1]!])
    await flushPromises()

    await submit(wrapper)

    const field = wrapper.find('#item-0-statement')
    expect(field.attributes('aria-invalid')).toBe('true')
    expect(wrapper.find('#item-0-statement-error').text()).toBe('Заполните это поле')
    expect(field.attributes('aria-describedby')).toContain('item-0-statement-error')
    expect(document.activeElement?.id).toBe('item-0-statement')
  })

  it('неудачное сохранение: ошибка ответа с role=alert, группа связана через aria-describedby, фокус на первой радиокнопке', async () => {
    const wrapper = await mountEditor(undefined, document.body)
    fillTitleAndGroup()
    setItems([{ statement: 'Митоз — деление клетки', answer: null }, VALID_ITEMS[1]!])
    await flushPromises()

    await submit(wrapper)

    const error = wrapper.find('#item-0-answer-error')
    expect(error.text()).toBe('Выберите правильный ответ')
    expect(error.attributes('role')).toBe('alert')
    expect(wrapper.findAll('.statement-card__answer')[0]!.attributes('aria-describedby')).toBe('item-0-answer-error')
    expect(wrapper.findAll('.statement-card')[0]!.classes()).toContain('statement-card--invalid')
    expect(document.activeElement).toBe(wrapper.findAll('.statement-card__radio')[0]!.element)
  })

  it('и утверждение, и ответ не заполнены: фокус сначала на утверждении', async () => {
    const wrapper = await mountEditor(undefined, document.body)
    fillTitleAndGroup()
    await flushPromises()

    await submit(wrapper)

    expect(document.activeElement?.id).toBe('item-0-statement')
  })

  it('выбор «Да»/«Нет» снимает ошибку ответа', async () => {
    const wrapper = await mountEditor()
    fillTitleAndGroup()
    setItems([{ statement: 'Митоз — деление клетки', answer: null }, VALID_ITEMS[1]!])
    await flushPromises()
    await submit(wrapper)
    expect(wrapper.find('#item-0-answer-error').exists()).toBe(true)

    await wrapper.findAll('.statement-card__radio')[0]!.setValue(true)

    expect(wrapper.find('#item-0-answer-error').exists()).toBe(false)
    expect(wrapper.findAll('.statement-card')[0]!.classes()).not.toContain('statement-card--invalid')
  })

  it('дубль: ошибка в обеих карточках с номером другого; сводка «в утверждениях: 1, 2»', async () => {
    const wrapper = await mountEditor()
    fillTitleAndGroup()
    setItems([
      { statement: 'Митоз — деление клетки', answer: true },
      { statement: ' митоз — деление КЛЕТКИ ', answer: false },
    ])
    await flushPromises()

    await submit(wrapper)

    expect(wrapper.find('#item-0-statement-error').text()).toBe('Такое утверждение уже есть под номером 2')
    expect(wrapper.find('#item-1-statement-error').text()).toBe('Такое утверждение уже есть под номером 1')
    expect(wrapper.find('.true-false-editor__error-text').text()).toBe('Исправьте отмеченные поля в утверждениях: 1, 2')
  })

  it('400 с issues от сервера: текст у поля по пути items.N.statement', async () => {
    const wrapper = await mountEditor()
    fillTitleAndGroup()
    setItems(VALID_ITEMS)
    await flushPromises()
    vi.spyOn(trueFalseApi, 'create').mockRejectedValue(new ApiError(400, [{ path: ['items', 1, 'statement'], message: 'Text is required' }] as never))

    await submit(wrapper)

    expect(wrapper.find('#item-1-statement-error').text()).toBe('Заполните это поле')
  })

  it('409 при создании — текст о лимите заданий', async () => {
    const wrapper = await mountEditor()
    fillTitleAndGroup()
    setItems(VALID_ITEMS)
    await flushPromises()
    vi.spyOn(trueFalseApi, 'create').mockRejectedValue(new ApiError(409))

    await submit(wrapper)

    expect(wrapper.find('.true-false-editor__error-text').text()).toContain('Достигнут лимит: не больше 100 заданий')
  })
})

describe('Редактор «да/нет»: сохранение и загрузка', () => {
  it('после сохранения показана ссылка на задание', async () => {
    vi.spyOn(trueFalseApi, 'create').mockImplementation(async (input) => saved(input))
    const wrapper = await mountEditor()
    fillTitleAndGroup()
    setItems(VALID_ITEMS)
    await flushPromises()

    await submit(wrapper)

    expect(wrapper.find('.true-false-editor__saved').exists()).toBe(true)
    expect(wrapper.find('.true-false-editor__saved-link').attributes('href')).toBe('/teacher')
  })

  it('создание → navigateTo на /teacher/true-false/<id> с replace, без повторного get', async () => {
    vi.spyOn(trueFalseApi, 'create').mockImplementation(async (input) => saved(input))
    const get = vi.spyOn(trueFalseApi, 'get')
    const wrapper = await mountEditor()
    fillTitleAndGroup()
    setItems(VALID_ITEMS)
    await flushPromises()

    await submit(wrapper)

    expect(navigateToMock).toHaveBeenCalledTimes(1)
    expect(navigateToMock.mock.calls[0]?.[0]).toMatch(new RegExp(`/teacher/true-false/${ID}$`))
    expect(navigateToMock.mock.calls[0]?.[1]).toEqual({ replace: true })
    expect(get).not.toHaveBeenCalled()
  })

  it('404 при загрузке — «Задание не найдено»', async () => {
    vi.spyOn(trueFalseApi, 'get').mockRejectedValue(new ApiError(404))

    const wrapper = await mountEditor(ID)

    expect(wrapper.find('[role="alert"]').text()).toBe('Задание не найдено')
  })

  it('размонтирование без создания сбрасывает store', async () => {
    const wrapper = await mountEditor()
    fillTitleAndGroup()
    await flushPromises()
    expect(useTrueFalseEditorStore().trueFalse.title).toBe('Клетка')

    wrapper.unmount()
    mounted.splice(0)

    expect(useTrueFalseEditorStore().trueFalse.title).toBe('')
    expect(useTrueFalseEditorStore().id).toBeNull()
  })

  it('правка без сохранения показывает «Есть несохранённые изменения»', async () => {
    const wrapper = await mountEditor()
    fillTitleAndGroup()
    await flushPromises()

    expect(wrapper.find('.true-false-editor__unsaved').exists()).toBe(true)
  })

  it('неудачное сохранение переключателя «показывать ответы» возвращает прежнее значение', async () => {
    vi.spyOn(trueFalseApi, 'create').mockImplementation(async (input) => saved(input))
    const wrapper = await mountEditor()
    fillTitleAndGroup()
    setItems(VALID_ITEMS)
    await flushPromises()
    await wrapper.find('.true-false-editor__settings').trigger('click')
    await flushPromises()
    const store = useTrueFalseEditorStore()
    expect(store.view).toBe('settings')
    vi.spyOn(trueFalseApi, 'update').mockRejectedValue(new ApiError(500))

    const checkbox = wrapper.find<HTMLInputElement>('#quiz-show-answers')
    await checkbox.setValue(false)
    await flushPromises()

    expect(store.trueFalse.showAnswers).toBe(true)
    expect(checkbox.element.checked).toBe(true)
  })
})
