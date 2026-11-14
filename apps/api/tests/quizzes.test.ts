import { MAX_QUIZZES_PER_TEACHER, type QuizInput } from '@nataskium/shared/schemas'
import { describe, expect, it } from 'vitest'
import {
  makeCreateQuiz,
  makeDeleteQuiz,
  makeGetQuiz,
  makeListQuizzes,
  makeUpdateQuiz,
} from '../src/features/quizzes'
import { AppError } from '../src/shared/errors'
import { makeFakeQuizRepository } from './fakes/quizFakes'

const INPUT: QuizInput = {
  title: 'Столицы',
  showAnswers: true,
  gradingScale: null,
  questions: [
    {
      text: 'Столица Франции?',
      options: [
        { text: 'Париж', isCorrect: true },
        { text: 'Рим', isCorrect: false },
      ],
    },
  ],
}
const NOT_FOUND_STATUS = 404

function setup(takenTokens: string[] = []) {
  const quizzes = makeFakeQuizRepository(takenTokens)
  return {
    create: makeCreateQuiz({ quizzes }),
    get: makeGetQuiz({ quizzes }),
    list: makeListQuizzes({ quizzes }),
    update: makeUpdateQuiz({ quizzes }),
    remove: makeDeleteQuiz({ quizzes }),
  }
}

async function expectNotFound(promise: Promise<unknown>) {
  const error = await promise.then(() => null, (e: unknown) => e)
  expect(error).toBeInstanceOf(AppError)
  expect((error as AppError).status).toBe(NOT_FOUND_STATUS)
}

describe('викторины: use-cases', () => {
  it('создание возвращает shareToken из 22 символов base64url', async () => {
    const { create } = setup()
    const quiz = await create('teacher-a', INPUT)
    expect(quiz.shareToken).toMatch(/^[A-Za-z0-9_-]{22}$/)
  })

  it('при занятом shareToken делает одну повторную попытку', async () => {
    const quizzes = makeFakeQuizRepository(['taken'])
    const tokens = ['taken', 'fresh']
    const create = makeCreateQuiz({ quizzes, generateShareToken: () => tokens.shift() ?? '' })
    expect((await create('teacher-a', INPUT)).shareToken).toBe('fresh')
  })

  it('после двух конфликтов подряд бросает ошибку', async () => {
    const quizzes = makeFakeQuizRepository(['taken'])
    const create = makeCreateQuiz({ quizzes, generateShareToken: () => 'taken' })
    await expect(create('teacher-a', INPUT)).rejects.toThrow()
  })

  it('лимит: 100-я создаётся, 101-я — 409; у другого учителя лимит свой', async () => {
    const { create } = setup()
    for (let i = 0; i < MAX_QUIZZES_PER_TEACHER; i++) await create('teacher-a', INPUT)
    const error = await create('teacher-a', INPUT).then(() => null, (e: unknown) => e)
    expect(error).toBeInstanceOf(AppError)
    expect((error as AppError).status).toBe(409)
    await expect(create('teacher-b', INPUT)).resolves.toBeDefined()
  })

  it('лимит: удалённые викторины не считаются', async () => {
    const { create, remove } = setup()
    const first = await create('teacher-a', INPUT)
    for (let i = 1; i < MAX_QUIZZES_PER_TEACHER; i++) await create('teacher-a', INPUT)
    await remove('teacher-a', first.id)
    await expect(create('teacher-a', INPUT)).resolves.toBeDefined()
  })

  it('чужая викторина: get, update, delete — NotFound', async () => {
    const { create, get, update, remove } = setup()
    const quiz = await create('teacher-a', INPUT)
    await expectNotFound(get('teacher-b', quiz.id))
    await expectNotFound(update('teacher-b', quiz.id, INPUT))
    await expectNotFound(remove('teacher-b', quiz.id))
    expect((await get('teacher-a', quiz.id)).title).toBe(INPUT.title)
  })

  it('удалённая не попадает в список и не открывается', async () => {
    const { create, get, list, update, remove } = setup()
    const quiz = await create('teacher-a', INPUT)
    await remove('teacher-a', quiz.id)
    expect(await list('teacher-a')).toEqual([])
    await expectNotFound(get('teacher-a', quiz.id))
    await expectNotFound(update('teacher-a', quiz.id, INPUT))
    await expectNotFound(remove('teacher-a', quiz.id))
  })

  it('update заменяет содержимое', async () => {
    const { create, update } = setup()
    const quiz = await create('teacher-a', INPUT)
    const updated = await update('teacher-a', quiz.id, { ...INPUT, title: 'Новое' })
    expect(updated.title).toBe('Новое')
    expect(updated.shareToken).toBe(quiz.shareToken)
  })
})
