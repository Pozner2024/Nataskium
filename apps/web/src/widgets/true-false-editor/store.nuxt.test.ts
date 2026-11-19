import { MAX_TRUE_FALSE_ITEMS, MIN_TRUE_FALSE_ITEMS } from '@nataskium/shared/schemas'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { trueFalseApi, type TrueFalseInput } from '@/entities/true-false'
import { useAuthStore } from '@/features/auth'
import { ApiError } from '@/shared'
import { useTrueFalseEditorStore } from './store'

const ID = '6f1c2a4e-8d3b-4f5a-9c7e-1b2d3e4f5a6b'
const SHARE_TOKEN = 'abcdefghijklmnopqrstuv'

let store: ReturnType<typeof useTrueFalseEditorStore>

function fillValid(): void {
  store.trueFalse.title = 'Клетка'
  store.trueFalse.group = 'other'
  store.trueFalse.items = [
    { statement: 'Митоз — деление клетки', answer: true },
    { statement: 'Ядро есть у бактерий', answer: false },
  ]
}

function respond(input: TrueFalseInput) {
  return { trueFalse: { ...input, id: ID, shareToken: SHARE_TOKEN, group: input.group ?? 'other', timer: input.timer ?? { mode: 'none' as const } } }
}

beforeEach(() => {
  setActivePinia(createPinia())
  useAuthStore().setSession({ accessToken: 'access-1', teacher: { id: 't1', email: 'a@example.test', displayName: 'A', hasPassword: true, hasGoogle: false } })
  store = useTrueFalseEditorStore()
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('useTrueFalseEditorStore: утверждения', () => {
  it('старт — два пустых утверждения, удалить нельзя', () => {
    expect(store.items).toEqual([
      { statement: '', answer: null },
      { statement: '', answer: null },
    ])
    expect(store.canRemoveItem).toBe(false)
    store.removeItem(0)
    expect(store.items).toHaveLength(MIN_TRUE_FALSE_ITEMS)
  })

  it('addItem не выходит за 30', () => {
    for (let i = 0; i < MAX_TRUE_FALSE_ITEMS + 3; i++) store.addItem()
    expect(store.items).toHaveLength(MAX_TRUE_FALSE_ITEMS)
    expect(store.canAddItem).toBe(false)
  })

  it('removeItem не опускается ниже 2 и сбрасывает ошибки', async () => {
    store.addItem()
    await store.save()
    expect(Object.keys(store.fieldErrors).length).toBeGreaterThan(0)
    store.removeItem(2)
    expect(store.items).toHaveLength(MIN_TRUE_FALSE_ITEMS)
    expect(store.fieldErrors).toEqual({})
    store.removeItem(0)
    expect(store.items).toHaveLength(MIN_TRUE_FALSE_ITEMS)
  })

  it('setAnswer меняет ответ нужного утверждения', () => {
    store.setAnswer(1, false)
    expect(store.items.map((item) => item.answer)).toEqual([null, false])
    store.setAnswer(0, true)
    expect(store.items.map((item) => item.answer)).toEqual([true, false])
  })
})

describe('useTrueFalseEditorStore: проверка перед сохранением', () => {
  it('пустое утверждение — ошибка по пути items.N.statement, запроса нет', async () => {
    const create = vi.spyOn(trueFalseApi, 'create')
    fillValid()
    store.trueFalse.items[1]!.statement = '  '

    expect(await store.save()).toBe(false)
    expect(create).not.toHaveBeenCalled()
    expect(store.saveStatus).toBe('invalid')
    expect(store.errorOf('items.1.statement')?.message).toBe('Text is required')
    expect(store.invalidItems).toEqual([2])
  })

  it('раздел не выбран — ошибка у поля group до запроса', async () => {
    const create = vi.spyOn(trueFalseApi, 'create')
    fillValid()
    store.trueFalse.group = ''

    expect(await store.save()).toBe(false)
    expect(create).not.toHaveBeenCalled()
    expect(store.errorOf('group')?.message).toBe('Invalid group')
  })

  it('новое задание: у обоих утверждений answer null', () => {
    expect(store.items.map((item) => item.answer)).toEqual([null, null])
  })

  it('сохранение с неотвеченным утверждением: invalid, ошибка items.0.answer, запрос не отправлен', async () => {
    const create = vi.spyOn(trueFalseApi, 'create')
    fillValid()
    store.trueFalse.items[0]!.answer = null

    expect(await store.save()).toBe(false)
    expect(create).not.toHaveBeenCalled()
    expect(store.saveStatus).toBe('invalid')
    expect(store.fieldErrors).toHaveProperty(['items.0.answer'])
    expect(store.fieldErrors).not.toHaveProperty(['items.1.answer'])
    expect(store.invalidItems).toEqual([1])
  })

  it('после setAnswer всех утверждений сохранение уходит с булевыми ответами', async () => {
    const create = vi.spyOn(trueFalseApi, 'create').mockImplementation(async (input) => respond(input))
    fillValid()
    store.trueFalse.items.forEach((item) => (item.answer = null))
    expect(await store.save()).toBe(false)

    store.setAnswer(0, true)
    store.setAnswer(1, false)

    expect(await store.save()).toBe(true)
    expect(create.mock.calls[0]?.[0].items.map((item) => item.answer)).toEqual([true, false])
  })

  it('ошибка ответа исчезает после выбора', async () => {
    fillValid()
    store.trueFalse.items[1]!.answer = null
    await store.save()
    expect(store.errorOf('items.1.answer')).toBeDefined()

    store.setAnswer(1, true)

    expect(store.errorOf('items.1.answer')).toBeUndefined()
    expect(store.invalidItems).toEqual([])
  })

  it('дубликат утверждения даёт ошибку на втором, partner на первом', async () => {
    fillValid()
    store.trueFalse.items[1]!.statement = '  митоз — деление клетки '

    expect(await store.save()).toBe(false)
    expect(store.errorOf('items.1.statement')).toEqual({ message: 'Duplicate text', partner: 1 })
    expect(store.errorOf('items.0.statement')).toEqual({ message: 'Duplicate text', partner: 2 })
    expect(store.invalidItems).toEqual([1, 2])
  })
})

describe('useTrueFalseEditorStore: сохранение', () => {
  it('сохранение создаёт, затем обновляет (create → update с тем же id)', async () => {
    const create = vi.spyOn(trueFalseApi, 'create').mockImplementation(async (input) => respond(input))
    const update = vi.spyOn(trueFalseApi, 'update').mockImplementation(async (_id, input) => respond(input))
    fillValid()
    store.trueFalse.title = '  Клетка  '

    expect(await store.save()).toBe(true)
    expect(create).toHaveBeenCalledOnce()
    expect(create.mock.calls[0]?.[0].title).toBe('Клетка')
    expect(store.id).toBe(ID)
    expect(store.shareToken).toBe(SHARE_TOKEN)
    expect(store.saveStatus).toBe('saved')
    expect(store.isDirty).toBe(false)

    store.trueFalse.title = 'Другое'
    await store.save()
    expect(update).toHaveBeenCalledWith(ID, expect.objectContaining({ title: 'Другое' }), 'access-1')
    expect(create).toHaveBeenCalledOnce()
  })

  it('409 лимита → saveStatus limitReached', async () => {
    vi.spyOn(trueFalseApi, 'create').mockRejectedValue(new ApiError(409))
    fillValid()
    expect(await store.save()).toBe(false)
    expect(store.saveStatus).toBe('limitReached')
  })

  it('400 с issues от сервера — ошибка у поля утверждения', async () => {
    vi.spyOn(trueFalseApi, 'create').mockRejectedValue(new ApiError(400, [{ path: ['items', '1', 'statement'], message: 'Duplicate text' }]))
    fillValid()
    expect(await store.save()).toBe(false)
    expect(store.saveStatus).toBe('invalid')
    expect(store.errorOf('items.1.statement')?.message).toBe('Duplicate text')
  })

  it('сетевая ошибка — failed', async () => {
    vi.spyOn(trueFalseApi, 'create').mockRejectedValue(new TypeError('network'))
    fillValid()
    expect(await store.save()).toBe(false)
    expect(store.saveStatus).toBe('failed')
  })

  it('isDirty после правки', async () => {
    expect(store.isDirty).toBe(false)
    store.trueFalse.title = 'Клетка'
    expect(store.isDirty).toBe(true)
    store.trueFalse.title = ''
    store.setAnswer(0, false)
    expect(store.isDirty).toBe(true)
  })
})

describe('useTrueFalseEditorStore: загрузка и сброс', () => {
  it('load заполняет форму и не помечает её изменённой', async () => {
    fillValid()
    const input = JSON.parse(JSON.stringify(store.trueFalse)) as TrueFalseInput
    store.reset()
    vi.spyOn(trueFalseApi, 'get').mockResolvedValue(respond(input))

    await store.load(ID)
    expect(store.loadStatus).toBe('ready')
    expect(store.items.map((item) => item.answer)).toEqual([true, false])
    expect(store.items[1]).toEqual({ statement: 'Ядро есть у бактерий', answer: false })
    expect(store.isDirty).toBe(false)
  })

  it('404 — notFound', async () => {
    vi.spyOn(trueFalseApi, 'get').mockRejectedValue(new ApiError(404))
    await store.load(ID)
    expect(store.loadStatus).toBe('notFound')
  })

  it('ответ load после reset игнорируется', async () => {
    fillValid()
    const input = JSON.parse(JSON.stringify(store.trueFalse)) as TrueFalseInput
    let resolve: (value: ReturnType<typeof respond>) => void = () => {}
    vi.spyOn(trueFalseApi, 'get').mockReturnValue(new Promise((done) => (resolve = done)))
    store.reset()
    const loading = store.load(ID)
    store.reset()
    resolve(respond(input))
    await loading
    expect(store.id).toBeNull()
    expect(store.trueFalse.title).toBe('')
  })
})
