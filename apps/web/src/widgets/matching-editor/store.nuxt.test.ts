import { MAX_MATCHING_PAIRS, MIN_MATCHING_PAIRS } from '@nataskium/shared/schemas'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { matchingApi, type MatchingInput } from '@/entities/matching'
import { useAuthStore } from '@/features/auth'
import { ApiError } from '@/shared'
import { useMatchingEditorStore } from './store'

const ID = '6f1c2a4e-8d3b-4f5a-9c7e-1b2d3e4f5a6b'
const SHARE_TOKEN = 'abcdefghijklmnopqrstuv'

let store: ReturnType<typeof useMatchingEditorStore>

function fillValid(): void {
  store.matching.title = 'Клетка'
  store.matching.group = 'other'
  store.matching.pairs = [
    { term: 'Митоз', definition: 'Деление клетки' },
    { term: 'Ядро', definition: 'Хранит наследственную информацию' },
  ]
}

function respond(input: MatchingInput) {
  return { matching: { ...input, id: ID, shareToken: SHARE_TOKEN, group: input.group ?? 'other', timer: input.timer ?? { mode: 'none' as const } } }
}

beforeEach(() => {
  setActivePinia(createPinia())
  useAuthStore().setSession({ accessToken: 'access-1', teacher: { id: 't1', email: 'a@example.test', displayName: 'A', hasPassword: true, hasGoogle: false } })
  store = useMatchingEditorStore()
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('useMatchingEditorStore: пары', () => {
  it('новое задание начинается с минимума пар, удалить нельзя', () => {
    expect(store.matching.pairs).toHaveLength(MIN_MATCHING_PAIRS)
    expect(store.canRemovePair).toBe(false)
    store.removePair(0)
    expect(store.matching.pairs).toHaveLength(MIN_MATCHING_PAIRS)
  })

  it('addPair не больше максимума', () => {
    for (let i = 0; i < MAX_MATCHING_PAIRS + 3; i++) store.addPair()
    expect(store.matching.pairs).toHaveLength(MAX_MATCHING_PAIRS)
    expect(store.canAddPair).toBe(false)
  })

  it('removePair удаляет нужную пару и сбрасывает ошибки', async () => {
    store.addPair()
    store.matching.pairs[1]!.term = 'второе'
    await store.save()
    expect(Object.keys(store.fieldErrors).length).toBeGreaterThan(0)
    store.removePair(1)
    expect(store.matching.pairs.map((pair) => pair.term)).not.toContain('второе')
    expect(store.fieldErrors).toEqual({})
  })
})

describe('useMatchingEditorStore: проверка перед сохранением', () => {
  it('пустые поля — ошибки по путям pairs.N.term/definition, запроса нет', async () => {
    const create = vi.spyOn(matchingApi, 'create')
    fillValid()
    store.matching.pairs[1]!.term = '  '

    expect(await store.save()).toBe(false)
    expect(create).not.toHaveBeenCalled()
    expect(store.saveStatus).toBe('invalid')
    expect(store.errorOf('pairs.1.term')?.message).toBe('Text is required')
    expect(store.invalidPairs).toEqual([2])
  })

  it('раздел не выбран — ошибка у поля group до запроса на сервер', async () => {
    const create = vi.spyOn(matchingApi, 'create')
    fillValid()
    store.matching.group = ''

    expect(await store.save()).toBe(false)
    expect(create).not.toHaveBeenCalled()
    expect(store.errorOf('group')?.message).toBe('Invalid group')
  })

  it('дубль слова подсвечен в обеих парах, без учёта регистра и пробелов', async () => {
    fillValid()
    store.matching.pairs[1]!.term = '  митоз '

    expect(await store.save()).toBe(false)
    expect(store.errorOf('pairs.0.term')).toEqual({ message: 'Duplicate text', partner: 2 })
    expect(store.errorOf('pairs.1.term')).toEqual({ message: 'Duplicate text', partner: 1 })
    expect(store.invalidPairs).toEqual([1, 2])
  })

  it('дубль определения подсвечен в обеих парах', async () => {
    fillValid()
    store.matching.pairs[1]!.definition = 'деление клетки'

    await store.save()
    expect(store.errorOf('pairs.0.definition')?.partner).toBe(2)
    expect(store.errorOf('pairs.1.definition')?.partner).toBe(1)
  })
})

describe('useMatchingEditorStore: сохранение', () => {
  it('create сохраняет id и ссылку, isDirty = false', async () => {
    const create = vi.spyOn(matchingApi, 'create').mockImplementation(async (input) => respond(input))
    fillValid()
    store.matching.title = '  Клетка  '

    expect(await store.save()).toBe(true)
    expect(create).toHaveBeenCalledOnce()
    expect(create.mock.calls[0]?.[0].title).toBe('Клетка')
    expect(store.id).toBe(ID)
    expect(store.shareToken).toBe(SHARE_TOKEN)
    expect(store.saveStatus).toBe('saved')
    expect(store.isDirty).toBe(false)
  })

  it('с id вызывает update', async () => {
    vi.spyOn(matchingApi, 'create').mockImplementation(async (input) => respond(input))
    const update = vi.spyOn(matchingApi, 'update').mockImplementation(async (_id, input) => respond(input))
    fillValid()
    await store.save()
    store.matching.title = 'Другое'
    await store.save()
    expect(update).toHaveBeenCalledWith(ID, expect.objectContaining({ title: 'Другое' }), 'access-1')
  })

  it('409 — лимит заданий', async () => {
    vi.spyOn(matchingApi, 'create').mockRejectedValue(new ApiError(409))
    fillValid()
    expect(await store.save()).toBe(false)
    expect(store.saveStatus).toBe('limitReached')
  })

  it('400 с issues от сервера — ошибки у полей, дубль в обеих парах', async () => {
    vi.spyOn(matchingApi, 'create').mockRejectedValue(
      new ApiError(400, [{ path: ['pairs', '1', 'term'], message: 'Duplicate text' }]),
    )
    fillValid()
    // Сервер нормализует строже клиента: на клиенте пары разные, дубль пришёл с сервера
    expect(await store.save()).toBe(false)
    expect(store.saveStatus).toBe('invalid')
    expect(store.errorOf('pairs.1.term')?.message).toBe('Duplicate text')
  })

  it('сетевая ошибка — failed', async () => {
    vi.spyOn(matchingApi, 'create').mockRejectedValue(new TypeError('network'))
    fillValid()
    expect(await store.save()).toBe(false)
    expect(store.saveStatus).toBe('failed')
  })
})

describe('useMatchingEditorStore: загрузка и сброс', () => {
  it('load заполняет форму и не помечает её изменённой', async () => {
    fillValid()
    const input = JSON.parse(JSON.stringify(store.matching)) as MatchingInput
    store.reset()
    vi.spyOn(matchingApi, 'get').mockResolvedValue(respond(input))

    await store.load(ID)
    expect(store.loadStatus).toBe('ready')
    expect(store.matching.pairs[0]?.term).toBe('Митоз')
    expect(store.isDirty).toBe(false)
  })

  it('404 — notFound', async () => {
    vi.spyOn(matchingApi, 'get').mockRejectedValue(new ApiError(404))
    await store.load(ID)
    expect(store.loadStatus).toBe('notFound')
  })

  it('ответ load после reset игнорируется', async () => {
    fillValid()
    const input = JSON.parse(JSON.stringify(store.matching)) as MatchingInput
    let resolve: (value: ReturnType<typeof respond>) => void = () => {}
    vi.spyOn(matchingApi, 'get').mockReturnValue(new Promise((done) => (resolve = done)))
    store.reset()
    const loading = store.load(ID)
    store.reset()
    resolve(respond(input))
    await loading
    expect(store.id).toBeNull()
    expect(store.matching.title).toBe('')
  })
})
