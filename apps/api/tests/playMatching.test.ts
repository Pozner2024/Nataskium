import { describe, expect, it, vi } from 'vitest'
import { makeFinishMatching, makeGetPlayActivity } from '../src/features/play'
import type { PlayMatchingSource, PlayQuizSource, PlayShuffle, PlayTrueFalseSource, PlayableMatching } from '../src/features/play'
import { AppError } from '../src/shared/errors'
import { secureShuffle } from '../src/shared/utils'

const QUIZ_TOKEN = 'q'.repeat(22)
const MATCHING_TOKEN = 'm'.repeat(22)
const UPDATED_AT = new Date('2026-11-16T10:00:00.000Z')
const NOT_FOUND_STATUS = 404
const PAIRS = [
  { term: 'кот', definition: 'мяукает' },
  { term: 'пёс', definition: 'лает' },
  { term: 'корова', definition: 'мычит' },
]

const MATCHING: PlayableMatching = {
  title: 'Животные',
  showAnswers: true,
  gradingScale: 'five',
  timer: { mode: 'stopwatch' },
  introTheme: 'nataskium-day',
  updatedAt: UPDATED_AT,
  pairs: PAIRS,
}

const NO_TRUE_FALSES: PlayTrueFalseSource = { findByShareToken: async () => null }

const reverse: PlayShuffle = (items) => [...items].reverse()

function setup(shuffle: PlayShuffle = reverse) {
  const quizzes: PlayQuizSource = {
    findByShareToken: vi.fn(async (token: string) =>
      token === QUIZ_TOKEN
        ? {
            title: 'Столицы',
            showAnswers: false,
            gradingScale: null,
            timer: { mode: 'none' as const },
            introTheme: 'nataskium-night' as const,
            updatedAt: UPDATED_AT,
            questions: [{ text: 'Q', imageId: null, options: [{ text: 'a', isCorrect: true, imageId: null }, { text: 'b', isCorrect: false, imageId: null }] }],
          }
        : null,
    ),
  }
  const matchings: PlayMatchingSource = {
    findByShareToken: vi.fn(async (token: string) => (token === MATCHING_TOKEN ? MATCHING : null)),
  }
  return { quizzes, matchings, get: makeGetPlayActivity({ quizzes, matchings, trueFalses: NO_TRUE_FALSES, imageUrl: () => null, shuffle }) }
}

async function rejection(promise: Promise<unknown>): Promise<unknown> {
  return promise.then(() => new Error('Promise resolved'), (error: unknown) => error)
}

describe('getPlayActivity', () => {
  it('токен викторины — type quiz, источник сопоставлений не спрашивается', async () => {
    const { get, matchings } = setup()
    const response = await get(QUIZ_TOKEN)

    expect(response.type).toBe('quiz')
    expect(matchings.findByShareToken).not.toHaveBeenCalled()
  })

  it('токен сопоставления: определения в порядке учителя, слова — в порядке shuffle, version = updatedAt', async () => {
    const { get } = setup()

    expect(await get(MATCHING_TOKEN)).toEqual({
      type: 'matching',
      matching: {
        title: 'Животные',
        showAnswers: true,
        timer: { mode: 'stopwatch' },
        introTheme: 'nataskium-day',
        version: UPDATED_AT.toISOString(),
        definitions: ['мяукает', 'лает', 'мычит'],
        terms: ['корова', 'пёс', 'кот'],
      },
    })
  })

  it('no-leak: в ответе нет пар, правильных ответов, шкалы и id; слова — мультимножество слов задания', async () => {
    const { get } = setup(secureShuffle)
    const response = await get(MATCHING_TOKEN)
    const body = JSON.stringify(response)

    for (const leak of ['pairs', 'correct', 'gradingScale', 'term"', 'definition"', 'id"']) expect(body).not.toContain(leak)
    if (response.type !== 'matching') throw new Error('expected matching')
    expect(Object.keys(response.matching).sort()).toEqual(['definitions', 'introTheme', 'showAnswers', 'terms', 'timer', 'title', 'version'])
    expect([...response.matching.terms].sort()).toEqual(PAIRS.map((pair) => pair.term).sort())
  })

  it('shuffle вызывается на каждый запрос', async () => {
    const shuffle = vi.fn(reverse) as unknown as PlayShuffle
    const { get } = setup(shuffle)
    await get(MATCHING_TOKEN)
    await get(MATCHING_TOKEN)

    expect(shuffle).toHaveBeenCalledTimes(2)
  })

  it('2 пары и 10 пар: определения в порядке учителя, слова — полный набор без потерь', async () => {
    for (const count of [2, 10]) {
      const pairs = Array.from({ length: count }, (_, i) => ({ term: 'слово ' + i, definition: 'определение ' + i }))
      const matchings: PlayMatchingSource = { findByShareToken: vi.fn(async () => ({ ...MATCHING, pairs })) }
      const quizzes: PlayQuizSource = { findByShareToken: vi.fn(async () => null) }
      const response = await makeGetPlayActivity({ quizzes, matchings, trueFalses: NO_TRUE_FALSES, imageUrl: () => null, shuffle: reverse })(MATCHING_TOKEN)

      if (response.type !== 'matching') throw new Error('expected matching')
      expect(response.matching.definitions).toEqual(pairs.map((pair) => pair.definition))
      expect([...response.matching.terms].sort()).toEqual(pairs.map((pair) => pair.term).sort())
    }
  })

  it('два задания с одинаковыми определениями: каждый токен отдаёт свои слова, пары не смешиваются', async () => {
    const first = [{ term: 'кот', definition: 'животное' }, { term: 'пёс', definition: 'друг' }]
    const second = [{ term: 'лев', definition: 'животное' }, { term: 'орёл', definition: 'птица' }]
    const byToken: Record<string, PlayableMatching> = {
      ['a'.repeat(22)]: { ...MATCHING, pairs: first },
      ['b'.repeat(22)]: { ...MATCHING, pairs: second },
    }
    const matchings: PlayMatchingSource = { findByShareToken: vi.fn(async (token: string) => byToken[token] ?? null) }
    const quizzes: PlayQuizSource = { findByShareToken: vi.fn(async () => null) }
    const get = makeGetPlayActivity({ quizzes, matchings, trueFalses: NO_TRUE_FALSES, imageUrl: () => null, shuffle: reverse })

    const a = await get('a'.repeat(22))
    const b = await get('b'.repeat(22))

    if (a.type !== 'matching' || b.type !== 'matching') throw new Error('expected matching')
    expect(a.matching.terms).toEqual(['пёс', 'кот'])
    expect(b.matching.terms).toEqual(['орёл', 'лев'])
    expect(a.matching.definitions).toEqual(['животное', 'друг'])
    expect(b.matching.definitions).toEqual(['животное', 'птица'])
  })

  it('таймер прокидывается как есть: limit с секундами сохраняется в ответе', async () => {
    const timer = { mode: 'limit' as const, seconds: 600 }
    const matchings: PlayMatchingSource = { findByShareToken: vi.fn(async () => ({ ...MATCHING, timer })) }
    const quizzes: PlayQuizSource = { findByShareToken: vi.fn(async () => null) }
    const response = await makeGetPlayActivity({ quizzes, matchings, trueFalses: NO_TRUE_FALSES, imageUrl: () => null, shuffle: reverse })(MATCHING_TOKEN)

    if (response.type !== 'matching') throw new Error('expected matching')
    expect(response.matching.timer).toEqual({ mode: 'limit', seconds: 600 })
  })

  it('лишние поля источника (id, teacherId, shareToken, isPublic) в ответ не попадают', async () => {
    const leaky = { ...MATCHING, id: 'row-id', teacherId: 'teacher-secret', shareToken: MATCHING_TOKEN, isPublic: true }
    const matchings: PlayMatchingSource = { findByShareToken: vi.fn(async () => leaky as PlayableMatching) }
    const quizzes: PlayQuizSource = { findByShareToken: vi.fn(async () => null) }
    const response = await makeGetPlayActivity({ quizzes, matchings, trueFalses: NO_TRUE_FALSES, imageUrl: () => null, shuffle: reverse })(MATCHING_TOKEN)

    const body = JSON.stringify(response)
    for (const leak of ['row-id', 'teacher-secret', 'isPublic', 'shareToken', 'updatedAt']) expect(body).not.toContain(leak)
  })

  it('неизвестный и невалидный токен — 404; невалидный — без обращения к БД', async () => {
    const { get, quizzes, matchings } = setup()

    const missing = await rejection(get('z'.repeat(22)))
    expect(missing).toBeInstanceOf(AppError)
    expect((missing as AppError).status).toBe(NOT_FOUND_STATUS)

    vi.mocked(quizzes.findByShareToken).mockClear()
    const invalid = await rejection(get('../etc/passwd'))
    expect((invalid as AppError).status).toBe(NOT_FOUND_STATUS)
    expect(quizzes.findByShareToken).not.toHaveBeenCalled()
    expect(matchings.findByShareToken).toHaveBeenCalledTimes(1)
  })
})

describe('secureShuffle', () => {
  it('возвращает перестановку и не меняет исходный массив', () => {
    const items = Object.freeze([1, 2, 3, 4, 5])
    const shuffled = secureShuffle(items)

    expect([...shuffled].sort()).toEqual([1, 2, 3, 4, 5])
    expect(items).toEqual([1, 2, 3, 4, 5])
  })

  it('встречаются разные порядки', () => {
    const orders = new Set(Array.from({ length: 50 }, () => secureShuffle([1, 2, 3, 4]).join()))

    expect(orders.size).toBeGreaterThan(1)
  })

  it('пустой массив — пустой результат, один элемент — тот же элемент', () => {
    expect(secureShuffle([])).toEqual([])
    expect(secureShuffle(['кот'])).toEqual(['кот'])
  })
})

describe('finishMatching', () => {
  const VERSION = UPDATED_AT.toISOString()
  const RIGHT = PAIRS.map((pair) => pair.term)
  const BAD_REQUEST_STATUS = 400
  const CONFLICT_STATUS = 409

  function finishWith(overrides: Partial<PlayableMatching> = {}) {
    const matching = { ...MATCHING, ...overrides }
    const matchings: PlayMatchingSource = { findByShareToken: async (token) => (token === MATCHING_TOKEN ? matching : null) }
    return makeFinishMatching({ matchings })
  }

  async function statusOf(promise: Promise<unknown>): Promise<number | null> {
    const error = await rejection(promise)
    return error instanceof AppError ? error.status : null
  }

  it('все пары верно — 100 %, оценка по шкале, partialCount = 0', async () => {
    const { result } = await finishWith()(MATCHING_TOKEN, { version: VERSION, answers: RIGHT })

    expect(result).toEqual({ percent: 100, grade: '5', correctCount: 3, partialCount: 0, totalCount: 3 })
  })

  it('одна пара из трёх — процент по summarizeQuiz (60/0)', async () => {
    const { result } = await finishWith()(MATCHING_TOKEN, { version: VERSION, answers: ['кот', 'корова', 'пёс'] })

    expect(result).toMatchObject({ correctCount: 1, partialCount: 0, totalCount: 3 })
    expect(result.percent).toBeCloseTo(100 / 3, 0)
  })

  it('null на всех позициях — 0 %, без ошибки', async () => {
    const { result } = await finishWith({ gradingScale: null })(MATCHING_TOKEN, { version: VERSION, answers: [null, null, null] })

    expect(result).toEqual({ percent: 0, grade: null, correctCount: 0, partialCount: 0, totalCount: 3 })
  })

  it('review только при showAnswers: правильное слово для каждого определения', async () => {
    const answers = ['пёс', null, 'корова']
    const shown = await finishWith({ showAnswers: true })(MATCHING_TOKEN, { version: VERSION, answers })
    const hidden = await finishWith({ showAnswers: false })(MATCHING_TOKEN, { version: VERSION, answers })

    expect(shown.review).toEqual([
      { correct: false, term: 'кот' },
      { correct: false, term: 'пёс' },
      { correct: true, term: 'корова' },
    ])
    expect(hidden).not.toHaveProperty('review')
  })

  it('устаревшая версия — 409', async () => {
    expect(await statusOf(finishWith()(MATCHING_TOKEN, { version: 'old', answers: RIGHT }))).toBe(CONFLICT_STATUS)
  })

  it.each([
    ['на один ответ меньше', RIGHT.slice(0, 2)],
    ['на один ответ больше', [...RIGHT, null]],
    ['слово не из задания', ['кот', 'пёс', 'лошадь']],
    ['строка из пробелов', ['кот', 'пёс', '   ']],
    ['слово с пробелами по краям', ['кот', 'пёс', ' корова ']],
    ['слово в другом регистре', ['кот', 'пёс', 'Корова']],
  ])('%s — 400', async (_name, answers) => {
    expect(await statusOf(finishWith()(MATCHING_TOKEN, { version: VERSION, answers }))).toBe(BAD_REQUEST_STATUS)
  })

  it('неизвестный и невалидный токен — 404', async () => {
    expect(await statusOf(finishWith()('z'.repeat(22), { version: VERSION, answers: RIGHT }))).toBe(NOT_FOUND_STATUS)
    expect(await statusOf(finishWith()('bad', { version: VERSION, answers: RIGHT }))).toBe(NOT_FOUND_STATUS)
  })
})
