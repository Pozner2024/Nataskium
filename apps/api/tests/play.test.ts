import { describe, expect, it } from 'vitest'
import { makeCheckAnswer, makeFinishQuiz, makeGetPlayQuiz } from '../src/features/play'
import type { PlayQuizSource, PlayableQuiz } from '../src/features/play'
import { AppError, ValidationError } from '../src/shared/errors'

const TOKEN = 'abcdefghijklmnopqrstuv'
const UPDATED_AT = new Date('2026-11-13T10:00:00.000Z')
const VERSION = UPDATED_AT.toISOString()
const NOT_FOUND_STATUS = 404
const CONFLICT_STATUS = 409

const IMAGES_BASE_URL = 'https://images.example.test'
const imageUrl = (imageId: string) => `${IMAGES_BASE_URL}/quiz-images/${imageId}.webp`

const question = (correct: boolean[]) => ({
  text: 'Вопрос',
  imageId: null,
  options: correct.map((isCorrect, index) => ({ text: `Вариант ${index}`, isCorrect, imageId: null })),
})

function setup(overrides: Partial<PlayableQuiz> = {}) {
  const quiz: PlayableQuiz = {
    title: 'Тест',
    showAnswers: true,
    gradingScale: 'five',
    updatedAt: UPDATED_AT,
    questions: [question([true, false]), question([false, true, true]), question([true, false, false])],
    ...overrides,
  }
  const quizzes: PlayQuizSource & { calls: number } = {
    calls: 0,
    async findByShareToken(token) {
      this.calls += 1
      return token === TOKEN ? quiz : null
    },
  }
  return {
    quizzes,
    getPlayQuiz: makeGetPlayQuiz({ quizzes, imageUrl }),
    checkAnswer: makeCheckAnswer({ quizzes }),
    finishQuiz: makeFinishQuiz({ quizzes }),
  }
}

async function rejection(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise
  } catch (error) {
    return error
  }
  throw new Error('Promise resolved')
}

describe('getPlayQuiz', () => {
  it('не содержит isCorrect и сохраняет порядок вариантов', async () => {
    const { getPlayQuiz } = setup()
    const { quiz } = await getPlayQuiz(TOKEN)

    expect(JSON.stringify(quiz)).not.toContain('isCorrect')
    expect(quiz.version).toBe(VERSION)
    expect(quiz.questions[1]).toEqual({
      text: 'Вопрос',
      imageUrl: null,
      options: [
        { text: 'Вариант 0', imageUrl: null },
        { text: 'Вариант 1', imageUrl: null },
        { text: 'Вариант 2', imageUrl: null },
      ],
      selectCount: 2,
    })
  })

  it('отдаёт адреса картинок вопроса и вариантов, но не их id; адрес не зависит от правильности', async () => {
    const questionImage = '0b6f2f8e-1111-4c1a-9a51-000000000001'
    const correctImage = '0b6f2f8e-1111-4c1a-9a51-000000000002'
    const wrongImage = '0b6f2f8e-1111-4c1a-9a51-000000000003'
    const { getPlayQuiz } = setup({
      questions: [
        {
          text: 'Где кошка?',
          imageId: questionImage,
          options: [
            { text: '', isCorrect: true, imageId: correctImage },
            { text: 'Собака', isCorrect: false, imageId: wrongImage },
          ],
        },
      ],
    })
    const { quiz } = await getPlayQuiz(TOKEN)

    expect(quiz.questions[0]).toEqual({
      text: 'Где кошка?',
      imageUrl: imageUrl(questionImage),
      options: [
        { text: '', imageUrl: imageUrl(correctImage) },
        { text: 'Собака', imageUrl: imageUrl(wrongImage) },
      ],
      selectCount: 1,
    })
    expect(JSON.stringify(quiz)).not.toContain('imageId')
  })

  it('без хранилища адреса картинок — null', async () => {
    const quizzes: PlayQuizSource = {
      async findByShareToken() {
        return {
          title: 'Тест',
          showAnswers: true,
          gradingScale: null,
          updatedAt: UPDATED_AT,
          questions: [{ ...question([true, false]), imageId: '0b6f2f8e-1111-4c1a-9a51-000000000001' }],
        }
      },
    }
    const { quiz } = await makeGetPlayQuiz({ quizzes, imageUrl: () => null })(TOKEN)
    expect(quiz.questions[0]?.imageUrl).toBeNull()
  })

  it('не содержит лишних полей модели', async () => {
    const { getPlayQuiz } = setup({ ...({ id: 'secret-id', shareToken: TOKEN } as object) })
    const body = JSON.stringify(await getPlayQuiz(TOKEN))
    expect(body).not.toContain('secret-id')
    expect(body).not.toContain(TOKEN)
  })

  it('отсутствующая и невалидная по формату ссылка — 404; невалидная не обращается к БД', async () => {
    const { getPlayQuiz, quizzes } = setup()
    const missing = await rejection(getPlayQuiz('zzzzzzzzzzzzzzzzzzzzzz'))
    expect((missing as AppError).status).toBe(NOT_FOUND_STATUS)

    const callsBefore = quizzes.calls
    const invalid = await rejection(getPlayQuiz('../etc/passwd'))
    expect((invalid as AppError).status).toBe(NOT_FOUND_STATUS)
    expect(quizzes.calls).toBe(callsBefore)
  })
})

describe('checkAnswer', () => {
  it('возвращает индексы правильных вариантов', async () => {
    const { checkAnswer } = setup()
    expect(await checkAnswer(TOKEN, { version: VERSION, questionIndex: 1, selected: [0, 1] })).toEqual({ correct: [1, 2] })
  })

  it('при showAnswers=false — 404', async () => {
    const { checkAnswer } = setup({ showAnswers: false })
    const error = await rejection(checkAnswer(TOKEN, { version: VERSION, questionIndex: 0, selected: [0] }))
    expect((error as AppError).status).toBe(NOT_FOUND_STATUS)
  })

  it('при showAnswers=false и старом version — 404, а не 409', async () => {
    const { checkAnswer } = setup({ showAnswers: false })
    const error = await rejection(checkAnswer(TOKEN, { version: 'old', questionIndex: 0, selected: [0] }))
    expect((error as AppError).status).toBe(NOT_FOUND_STATUS)
  })

  it('старый version — 409', async () => {
    const { checkAnswer } = setup()
    const error = await rejection(checkAnswer(TOKEN, { version: 'old', questionIndex: 0, selected: [0] }))
    expect((error as AppError).status).toBe(CONFLICT_STATUS)
  })

  it('selected длиннее selectCount, индекс вне диапазона, вопрос вне диапазона — 400', async () => {
    const { checkAnswer } = setup()
    for (const input of [
      { questionIndex: 0, selected: [0, 1] },
      { questionIndex: 0, selected: [] },
      { questionIndex: 0, selected: [2] },
      { questionIndex: 3, selected: [0] },
    ]) {
      expect(await rejection(checkAnswer(TOKEN, { version: VERSION, ...input }))).toBeInstanceOf(ValidationError)
    }
  })
})

describe('finishQuiz', () => {
  it('считает [60, 30, 0] по шкале five как 50% и оценку 3', async () => {
    const { finishQuiz } = setup()
    const { result } = await finishQuiz(TOKEN, { version: VERSION, answers: [[0], [1, 0], [1]] })
    expect(result).toEqual({ percent: 50, grade: '3', correctCount: 1, partialCount: 1, totalCount: 3 })
  })

  it('без шкалы оценка null', async () => {
    const { finishQuiz } = setup({ gradingScale: null })
    const { result } = await finishQuiz(TOKEN, { version: VERSION, answers: [[0], [1, 2], [0]] })
    expect(result.grade).toBeNull()
    expect(result.percent).toBe(100)
  })

  it('старый version — 409', async () => {
    const { finishQuiz } = setup()
    const error = await rejection(finishQuiz(TOKEN, { version: 'old', answers: [[0], [1, 2], [0]] }))
    expect((error as AppError).status).toBe(CONFLICT_STATUS)
  })

  it('неверное число ответов, длина selected и индекс вне диапазона — 400', async () => {
    const { finishQuiz } = setup()
    for (const answers of [[[0]], [[0], [1, 2], [0], [0]], [[0, 1], [1, 2], [0]], [[0], [1, 2], [3]], [[0], [1], [0]]]) {
      expect(await rejection(finishQuiz(TOKEN, { version: VERSION, answers }))).toBeInstanceOf(ValidationError)
    }
  })

  it('работает и при showAnswers=false', async () => {
    const { finishQuiz } = setup({ showAnswers: false })
    const { result } = await finishQuiz(TOKEN, { version: VERSION, answers: [[0], [1, 2], [0]] })
    expect(result.percent).toBe(100)
  })
})
