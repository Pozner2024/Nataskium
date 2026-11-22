import { MAX_ACTIVITIES_PER_TEACHER, type TrueFalseInput } from '@nataskium/shared/schemas'
import { describe, expect, it } from 'vitest'
import { makeCreateTrueFalse, makeDeleteTrueFalse, makeGetTrueFalse, makeUpdateTrueFalse } from '../src/features/trueFalse'
import { AppError } from '../src/shared/errors'
import { makeFakeTrueFalseRepository } from './fakes/trueFalseFakes'

const INPUT: TrueFalseInput = {
  title: 'Факты',
  showAnswers: true,
  gradingScale: null,
  group: 'other',
  timer: { mode: 'none' },
  introTheme: 'nataskium-night',
  items: [
    { statement: 'Земля круглая', answer: true },
    { statement: 'Солнце холодное', answer: false },
  ],
}
const TEACHER = 'teacher-a'
const OTHER_TEACHER = 'teacher-b'
const BAD_REQUEST_STATUS = 400
const NOT_FOUND_STATUS = 404
const CONFLICT_STATUS = 409

function setup(options: Parameters<typeof makeFakeTrueFalseRepository>[0] = {}) {
  const { repository, records } = makeFakeTrueFalseRepository(options)
  return {
    records,
    create: makeCreateTrueFalse({ trueFalse: repository }),
    get: makeGetTrueFalse({ trueFalse: repository }),
    update: makeUpdateTrueFalse({ trueFalse: repository }),
    remove: makeDeleteTrueFalse({ trueFalse: repository }),
  }
}

async function expectStatus(promise: Promise<unknown>, status: number) {
  const error = await promise.then(() => null, (reason: unknown) => reason)
  expect(error).toBeInstanceOf(AppError)
  expect((error as AppError).status).toBe(status)
}

describe('да/нет: use-cases', () => {
  it('create отклоняет неизвестный раздел (400), ничего не записано', async () => {
    const { create, records } = setup()

    await expectStatus(create(TEACHER, { ...INPUT, group: 'missing' }), BAD_REQUEST_STATUS)
    expect(records).toHaveLength(0)
  })

  it('create создаёт публичное задание по умолчанию и непубличную копию по опции', async () => {
    const { create, records } = setup()
    await create(TEACHER, INPUT)
    await create(TEACHER, INPUT, { isPublic: false })

    expect(records.map((record) => record.isPublic)).toEqual([true, false])
  })

  it(`create на ${MAX_ACTIVITIES_PER_TEACHER}-м задании даёт 409`, async () => {
    const { create } = setup({ otherActivities: { [TEACHER]: MAX_ACTIVITIES_PER_TEACHER - 1 } })

    await expect(create(TEACHER, INPUT)).resolves.toBeDefined()
    await expectStatus(create(TEACHER, INPUT), CONFLICT_STATUS)
  })

  it('get чужого задания даёт 404', async () => {
    const { create, get } = setup()
    const created = await create(TEACHER, INPUT)

    await expectStatus(get(OTHER_TEACHER, created.id), NOT_FOUND_STATUS)
    await expect(get(TEACHER, created.id)).resolves.toMatchObject({ items: INPUT.items })
  })

  it('update и delete чужого — 404, запись не изменена', async () => {
    const { create, get, update, remove } = setup()
    const created = await create(TEACHER, INPUT)

    await expectStatus(update(OTHER_TEACHER, created.id, { ...INPUT, title: 'Чужое' }), NOT_FOUND_STATUS)
    await expectStatus(remove(OTHER_TEACHER, created.id), NOT_FOUND_STATUS)
    expect((await get(TEACHER, created.id)).title).toBe(INPUT.title)
  })

  it('update заменяет утверждения, delete скрывает задание', async () => {
    const { create, get, update, remove } = setup()
    const created = await create(TEACHER, INPUT)
    const items = [...INPUT.items, { statement: 'Вода мокрая', answer: true }]

    expect((await update(TEACHER, created.id, { ...INPUT, items })).items).toEqual(items)
    await remove(TEACHER, created.id)
    await expectStatus(get(TEACHER, created.id), NOT_FOUND_STATUS)
  })
})
