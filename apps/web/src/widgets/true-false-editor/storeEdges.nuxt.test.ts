import { MAX_TRUE_FALSE_ITEMS, MIN_TRUE_FALSE_ITEMS, TRUE_FALSE_STATEMENT_MAX_LENGTH } from '@nataskium/shared/schemas'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { trueFalseApi, type TrueFalseInput } from '@/entities/true-false'
import { useAuthStore } from '@/features/auth'
import { useTrueFalseEditorStore } from './store'

const ID = '6f1c2a4e-8d3b-4f5a-9c7e-1b2d3e4f5a6b'
const SHARE_TOKEN = 'abcdefghijklmnopqrstuv'

let store: ReturnType<typeof useTrueFalseEditorStore>

function respond(input: TrueFalseInput) {
  return { trueFalse: { ...input, id: ID, shareToken: SHARE_TOKEN, group: input.group ?? 'other', timer: input.timer ?? { mode: 'none' as const } } }
}

function setItems(count: number, statement = (i: number) => 'Утверждение ' + i): void {
  store.trueFalse.title = 'Тема'
  store.trueFalse.group = 'other'
  store.trueFalse.items = Array.from({ length: count }, (_, i) => ({ statement: statement(i), answer: i % 2 === 0 }))
}

beforeEach(() => {
  setActivePinia(createPinia())
  useAuthStore().setSession({ accessToken: 'access-1', teacher: { id: 't1', email: 'a@example.test', displayName: 'A', hasPassword: true, hasGoogle: false } })
  store = useTrueFalseEditorStore()
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('useTrueFalseEditorStore: граничные значения', () => {
  it('утверждение ровно в 200 знаков сохраняется, 201 — ошибка у поля, запроса нет', async () => {
    const create = vi.spyOn(trueFalseApi, 'create').mockImplementation(async (input) => respond(input))
    setItems(2, (i) => String(i) + 'я'.repeat(TRUE_FALSE_STATEMENT_MAX_LENGTH - 1))
    expect(await store.save()).toBe(true)
    expect(create.mock.calls[0]?.[0].items[0]?.statement).toHaveLength(TRUE_FALSE_STATEMENT_MAX_LENGTH)

    store.trueFalse.items[1]!.statement = 'я'.repeat(TRUE_FALSE_STATEMENT_MAX_LENGTH + 1)
    expect(await store.save()).toBe(false)
    expect(store.saveStatus).toBe('invalid')
    expect(Object.keys(store.fieldErrors)).toEqual(['items.1.statement'])
    expect(create).toHaveBeenCalledOnce()
  })

  it('пробелы по краям не засчитываются в 200 знаков и обрезаются в запросе', async () => {
    const create = vi.spyOn(trueFalseApi, 'create').mockImplementation(async (input) => respond(input))
    setItems(2)
    store.trueFalse.items[0]!.statement = '  ' + 'я'.repeat(TRUE_FALSE_STATEMENT_MAX_LENGTH) + '  '

    expect(await store.save()).toBe(true)
    expect(create.mock.calls[0]?.[0].items[0]?.statement).toBe('я'.repeat(TRUE_FALSE_STATEMENT_MAX_LENGTH))
  })

  it('30 утверждений уходят одним запросом в том же порядке', async () => {
    const create = vi.spyOn(trueFalseApi, 'create').mockImplementation(async (input) => respond(input))
    setItems(MAX_TRUE_FALSE_ITEMS)

    expect(await store.save()).toBe(true)
    expect(create.mock.calls[0]?.[0].items.map((item) => item.statement)).toEqual(Array.from({ length: MAX_TRUE_FALSE_ITEMS }, (_, i) => 'Утверждение ' + i))
  })

  it('дубль, отличающийся регистром и пробелами, ловится у обеих карточек', async () => {
    const create = vi.spyOn(trueFalseApi, 'create')
    setItems(3)
    store.trueFalse.items[2]!.statement = '  УТВЕРЖДЕНИЕ   0 '

    expect(await store.save()).toBe(false)
    expect(create).not.toHaveBeenCalled()
    expect(store.fieldErrors['items.0.statement']).toEqual({ message: 'Duplicate text', partner: 3 })
    expect(store.fieldErrors['items.2.statement']).toEqual({ message: 'Duplicate text', partner: 1 })
    expect(store.invalidItems).toEqual([1, 3])
  })
})

describe('useTrueFalseEditorStore: быстрые добавления и удаления', () => {
  it('добавить до 30, удалить из середины до 2: порядок остальных сохраняется, границы держатся', () => {
    setItems(MIN_TRUE_FALSE_ITEMS)
    while (store.canAddItem) store.addItem()
    expect(store.items).toHaveLength(MAX_TRUE_FALSE_ITEMS)
    store.items.forEach((item, i) => {
      item.statement = 'S' + i
    })

    while (store.canRemoveItem) store.removeItem(Math.floor(store.items.length / 2))

    expect(store.items).toHaveLength(MIN_TRUE_FALSE_ITEMS)
    expect(store.items[0]?.statement).toBe('S0')
    expect(store.items[1]?.statement).toBe('S29')
    store.removeItem(0)
    store.addItem()
    store.addItem()
    expect(store.items).toHaveLength(4)
  })

  it('удаление с индексом вне диапазона ничего не ломает: утверждения на месте', () => {
    setItems(3)

    store.removeItem(10)

    expect(store.items).toHaveLength(3)
  })

  it('setAnswer с индексом вне диапазона — без эффекта и без исключения', () => {
    setItems(2)
    const before = JSON.stringify(store.items)

    store.setAnswer(5, true)

    expect(JSON.stringify(store.items)).toBe(before)
  })

  it('возврат правки к сохранённому значению снимает isDirty', async () => {
    vi.spyOn(trueFalseApi, 'create').mockImplementation(async (input) => respond(input))
    setItems(2)
    await store.save()

    store.trueFalse.items[0]!.statement = 'Другое'
    expect(store.isDirty).toBe(true)
    store.trueFalse.items[0]!.statement = 'Утверждение 0'
    expect(store.isDirty).toBe(false)
  })
})
