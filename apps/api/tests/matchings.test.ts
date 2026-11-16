import { MAX_ACTIVITIES_PER_TEACHER, type MatchingInput } from '@nataskium/shared/schemas'
import { describe, expect, it, vi } from 'vitest'
import {
  type MatchingRepository,
  makeCreateMatching,
  makeDeleteMatching,
  makeGetMatching,
  makeUpdateMatching,
} from '../src/features/matchings'
import { AppError, UnauthorizedError } from '../src/shared/errors'
import { makeFakeMatchingRepository } from './fakes/matchingFakes'

const INPUT: MatchingInput = {
  title: 'Животные',
  showAnswers: true,
  gradingScale: null,
  group: 'other',
  timer: { mode: 'none' },
  pairs: [
    { term: 'кот', definition: 'мяукает' },
    { term: 'пёс', definition: 'лает' },
  ],
}
const TEACHER = 'teacher-a'
const OTHER_TEACHER = 'teacher-b'
const BAD_REQUEST_STATUS = 400
const NOT_FOUND_STATUS = 404
const CONFLICT_STATUS = 409
const SHARE_TOKEN_PATTERN = /^[A-Za-z0-9_-]{22}$/

function setup(options: Parameters<typeof makeFakeMatchingRepository>[0] = {}, generateShareToken?: () => string) {
  const { repository, records } = makeFakeMatchingRepository(options)
  return {
    records,
    create: makeCreateMatching({ matchings: repository, generateShareToken }),
    get: makeGetMatching({ matchings: repository }),
    update: makeUpdateMatching({ matchings: repository }),
    remove: makeDeleteMatching({ matchings: repository }),
  }
}

async function errorOf(promise: Promise<unknown>): Promise<unknown> {
  return promise.then(() => null, (error: unknown) => error)
}

async function expectStatus(promise: Promise<unknown>, status: number) {
  const error = await errorOf(promise)
  expect(error).toBeInstanceOf(AppError)
  expect((error as AppError).status).toBe(status)
}

describe('сопоставления: use-cases', () => {
  it('создание: shareToken из 22 символов base64url, публикуется по умолчанию', async () => {
    const { create, records } = setup()
    const matching = await create(TEACHER, INPUT)

    expect(matching.shareToken).toMatch(SHARE_TOKEN_PATTERN)
    expect(matching.pairs).toEqual(INPUT.pairs)
    expect(records[0]?.isPublic).toBe(true)
  })

  it('копия из библиотеки создаётся непубличной', async () => {
    const { create, records } = setup()
    await create(TEACHER, INPUT, { isPublic: false })

    expect(records[0]?.isPublic).toBe(false)
  })

  it('при занятом shareToken делает одну повторную попытку', async () => {
    const tokens = ['A'.repeat(22), 'B'.repeat(22)]
    const { create } = setup({ takenTokens: [tokens[0]!] }, () => tokens.shift()!)

    expect((await create(TEACHER, INPUT)).shareToken).toBe('B'.repeat(22))
  })

  it('после двух конфликтов подряд бросает ошибку', async () => {
    const taken = 'A'.repeat(22)
    const { create } = setup({ takenTokens: [taken] }, () => taken)

    await expect(create(TEACHER, INPUT)).rejects.toThrow('Could not generate a unique share token')
  })

  it(`лимит общий с викторинами: ${MAX_ACTIVITIES_PER_TEACHER - 1} викторин + 1 сопоставление — можно, следующее — 409`, async () => {
    const { create } = setup({ otherActivities: { [TEACHER]: MAX_ACTIVITIES_PER_TEACHER - 1 } })

    await expect(create(TEACHER, INPUT)).resolves.toBeDefined()
    await expectStatus(create(TEACHER, INPUT), CONFLICT_STATUS)
  })

  it(`лимит: при ${MAX_ACTIVITIES_PER_TEACHER} викторинах сопоставление не создаётся; у другого учителя лимит свой`, async () => {
    const { create, records } = setup({ otherActivities: { [TEACHER]: MAX_ACTIVITIES_PER_TEACHER } })

    await expectStatus(create(TEACHER, INPUT), CONFLICT_STATUS)
    expect(records).toHaveLength(0)
    await expect(create(OTHER_TEACHER, INPUT)).resolves.toBeDefined()
  })

  it('копия из библиотеки (isPublic: false) тоже занимает место в лимите', async () => {
    const { create } = setup({ otherActivities: { [TEACHER]: MAX_ACTIVITIES_PER_TEACHER - 1 } })

    await expect(create(TEACHER, INPUT, { isPublic: false })).resolves.toBeDefined()
    await expectStatus(create(TEACHER, INPUT, { isPublic: false }), CONFLICT_STATUS)
  })

  it('лимит: удалённые не считаются', async () => {
    const { create, remove } = setup({ otherActivities: { [TEACHER]: MAX_ACTIVITIES_PER_TEACHER - 1 } })
    const matching = await create(TEACHER, INPUT)
    await remove(TEACHER, matching.id)

    await expect(create(TEACHER, INPUT)).resolves.toBeDefined()
  })

  it('чужой update не меняет пары', async () => {
    const { create, get, update } = setup()
    const matching = await create(TEACHER, INPUT)

    await expectStatus(update(OTHER_TEACHER, matching.id, { ...INPUT, pairs: [{ term: 'x', definition: 'y' }, { term: 'z', definition: 'w' }] }), NOT_FOUND_STATUS)
    expect((await get(TEACHER, matching.id)).pairs).toEqual(INPUT.pairs)
  })

  it('неизвестная группа: create и update — 400, ничего не записано', async () => {
    const { create, update, get, records } = setup()
    await expectStatus(create(TEACHER, { ...INPUT, group: 'missing' }), BAD_REQUEST_STATUS)
    expect(records).toHaveLength(0)

    const matching = await create(TEACHER, INPUT)
    await expectStatus(update(TEACHER, matching.id, { ...INPUT, title: 'Новое', group: 'missing' }), BAD_REQUEST_STATUS)
    expect((await get(TEACHER, matching.id)).title).toBe(INPUT.title)
  })

  it('чужое: get, update, delete — 404, запись не изменена', async () => {
    const { create, get, update, remove } = setup()
    const matching = await create(TEACHER, INPUT)

    await expectStatus(get(OTHER_TEACHER, matching.id), NOT_FOUND_STATUS)
    await expectStatus(update(OTHER_TEACHER, matching.id, { ...INPUT, title: 'Чужое' }), NOT_FOUND_STATUS)
    await expectStatus(remove(OTHER_TEACHER, matching.id), NOT_FOUND_STATUS)
    expect((await get(TEACHER, matching.id)).title).toBe(INPUT.title)
  })

  it('несуществующее и удалённое — тот же 404', async () => {
    const { create, get, update, remove } = setup()
    await expectStatus(get(TEACHER, 'missing-id'), NOT_FOUND_STATUS)

    const matching = await create(TEACHER, INPUT)
    await remove(TEACHER, matching.id)
    await expectStatus(get(TEACHER, matching.id), NOT_FOUND_STATUS)
    await expectStatus(update(TEACHER, matching.id, INPUT), NOT_FOUND_STATUS)
    await expectStatus(remove(TEACHER, matching.id), NOT_FOUND_STATUS)
  })

  it('update заменяет пары и настройки, updatedAt меняется', async () => {
    const { create, update } = setup()
    const matching = await create(TEACHER, INPUT)
    const changed: MatchingInput = {
      ...INPUT,
      title: 'Звуки',
      timer: { mode: 'limit', seconds: 600 },
      pairs: [...INPUT.pairs, { term: 'корова', definition: 'мычит' }],
    }
    vi.useFakeTimers({ toFake: ['Date'], now: matching.updatedAt.getTime() + 1000 })
    try {
      const updated = await update(TEACHER, matching.id, changed)

      expect(updated).toMatchObject({ id: matching.id, shareToken: matching.shareToken, title: 'Звуки', pairs: changed.pairs, timer: changed.timer })
      expect(updated.updatedAt.getTime()).toBeGreaterThan(matching.updatedAt.getTime())
    } finally {
      vi.useRealTimers()
    }
  })

  it('удалённый аккаунт при действующем токене: 401 без повторной попытки', async () => {
    const generateShareToken = vi.fn(() => 'A'.repeat(22))
    const { create } = setup({ deletedTeachers: [TEACHER] }, generateShareToken)

    expect(await errorOf(create(TEACHER, INPUT))).toBeInstanceOf(UnauthorizedError)
    expect(generateShareToken).toHaveBeenCalledTimes(1)
  })

  it('группу удалили между проверкой и вставкой — 400 Unknown group, не 401', async () => {
    const groupExists = vi.fn<MatchingRepository['groupExists']>().mockResolvedValueOnce(true).mockResolvedValue(false)
    const matchings: MatchingRepository = {
      ...makeFakeMatchingRepository().repository,
      groupExists,
      create: vi.fn(async () => 'referenceMissing' as const),
    }

    const error = await errorOf(makeCreateMatching({ matchings })(TEACHER, INPUT))
    expect(error).toBeInstanceOf(AppError)
    expect(error).not.toBeInstanceOf(UnauthorizedError)
    expect((error as AppError).status).toBe(BAD_REQUEST_STATUS)
  })
})
