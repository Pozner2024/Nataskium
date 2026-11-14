import { MAX_QUIZZES_PER_TEACHER, type QuizInput } from '@nataskium/shared/schemas'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  makeCreateQuiz,
  makeDeleteQuiz,
  makeGetQuiz,
  makeListQuizzes,
  makeUpdateQuiz,
} from '../src/features/quizzes'
import type { QuizRepository } from '../src/features/quizzes'
import { AppError } from '../src/shared/errors'
import { makeFakeQuizImages, makeFakeQuizRepository, makeFakeQuizTransaction } from './fakes/quizFakes'

const INPUT: QuizInput = {
  title: 'Столицы',
  showAnswers: true,
  gradingScale: null,
  questions: [
    {
      text: 'Столица Франции?',
      imageId: null,
      options: [
        { text: 'Париж', isCorrect: true, imageId: null },
        { text: 'Рим', isCorrect: false, imageId: null },
      ],
    },
  ],
}
const NOT_FOUND_STATUS = 404

function writeDeps(quizzes: QuizRepository, images = makeFakeQuizImages(), withFiles = true) {
  return { quizzes, transaction: makeFakeQuizTransaction(quizzes, images.links), imageFiles: withFiles ? images.files : null }
}

function setup(takenTokens: string[] = [], options: { withFiles?: boolean } = {}) {
  const quizzes = makeFakeQuizRepository(takenTokens)
  const images = makeFakeQuizImages()
  const deps = writeDeps(quizzes, images, options.withFiles ?? true)
  return {
    images,
    create: makeCreateQuiz(deps),
    get: makeGetQuiz({ quizzes }),
    list: makeListQuizzes({ quizzes }),
    update: makeUpdateQuiz(deps),
    remove: makeDeleteQuiz(deps),
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
    const create = makeCreateQuiz({ ...writeDeps(quizzes), generateShareToken: () => tokens.shift() ?? '' })
    expect((await create('teacher-a', INPUT)).shareToken).toBe('fresh')
  })

  it('после двух конфликтов подряд бросает ошибку', async () => {
    const quizzes = makeFakeQuizRepository(['taken'])
    const create = makeCreateQuiz({ ...writeDeps(quizzes), generateShareToken: () => 'taken' })
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

const BAD_REQUEST_STATUS = 400
const SERVICE_UNAVAILABLE_STATUS = 503
const IMAGE_A = '0b6f2f8e-1111-4c1a-9a51-000000000001'
const IMAGE_B = '0b6f2f8e-1111-4c1a-9a51-000000000002'
const IMAGE_C = '0b6f2f8e-1111-4c1a-9a51-000000000003'

function withImages(questionImage: string | null, optionImage: string | null): QuizInput {
  const [question] = INPUT.questions
  return {
    ...INPUT,
    questions: [
      { ...question!, imageId: questionImage, options: [{ ...question!.options[0]!, imageId: optionImage }, question!.options[1]!] },
    ],
  }
}

async function expectStatus(promise: Promise<unknown>, status: number, message?: string) {
  const error = await promise.then(() => null, (e: unknown) => e)
  expect(error).toBeInstanceOf(AppError)
  expect((error as AppError).status).toBe(status)
  if (message !== undefined) expect((error as AppError).message).toBe(message)
}

describe('викторины: картинки', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('создание привязывает картинки учителя к викторине', async () => {
    const { create, images } = setup()
    images.rows.set(IMAGE_A, { teacherId: 'teacher-a', quizId: null })
    images.rows.set(IMAGE_B, { teacherId: 'teacher-a', quizId: null })
    const quiz = await create('teacher-a', withImages(IMAGE_A, IMAGE_B))
    expect(images.rows.get(IMAGE_A)?.quizId).toBe(quiz.id)
    expect(images.rows.get(IMAGE_B)?.quizId).toBe(quiz.id)
  })

  it('чужая, выдуманная и занятая другой викториной картинка — 400 Unknown image', async () => {
    const { create, images } = setup()
    images.rows.set(IMAGE_A, { teacherId: 'teacher-b', quizId: null })
    images.rows.set(IMAGE_B, { teacherId: 'teacher-a', quizId: 'other-quiz' })
    await expectStatus(create('teacher-a', withImages(IMAGE_A, null)), BAD_REQUEST_STATUS, 'Unknown image')
    await expectStatus(create('teacher-a', withImages(IMAGE_C, null)), BAD_REQUEST_STATUS, 'Unknown image')
    await expectStatus(create('teacher-a', withImages(IMAGE_B, null)), BAD_REQUEST_STATUS, 'Unknown image')
  })

  it('одна картинка в двух местах викторины — 400 до обращения к базе', async () => {
    const { create, images } = setup()
    images.rows.set(IMAGE_A, { teacherId: 'teacher-a', quizId: null })
    await expectStatus(create('teacher-a', withImages(IMAGE_A, IMAGE_A)), BAD_REQUEST_STATUS, 'Image is used more than once')
    expect(images.rows.get(IMAGE_A)?.quizId).toBeNull()
  })

  it('без хранилища: викторина с картинкой — 503, без картинок — создаётся', async () => {
    const { create } = setup([], { withFiles: false })
    await expectStatus(create('teacher-a', withImages(IMAGE_A, null)), SERVICE_UNAVAILABLE_STATUS)
    await expect(create('teacher-a', INPUT)).resolves.toBeDefined()
  })

  it('замена картинки: старая отвязана, файл и строка удалены после сохранения', async () => {
    const { create, update, images } = setup()
    images.rows.set(IMAGE_A, { teacherId: 'teacher-a', quizId: null })
    images.rows.set(IMAGE_B, { teacherId: 'teacher-a', quizId: null })
    const quiz = await create('teacher-a', withImages(IMAGE_A, null))

    const updated = await update('teacher-a', quiz.id, withImages(IMAGE_B, null))
    expect(updated.questions[0]?.imageId).toBe(IMAGE_B)
    expect(images.removedFiles).toEqual([IMAGE_A])
    expect(images.rows.has(IMAGE_A)).toBe(false)
    expect(images.rows.get(IMAGE_B)?.quizId).toBe(quiz.id)
  })

  it('PATCH с неизвестной картинкой — 400, файлы не удаляются', async () => {
    const { create, update, images } = setup()
    images.rows.set(IMAGE_A, { teacherId: 'teacher-a', quizId: null })
    const quiz = await create('teacher-a', withImages(IMAGE_A, null))
    await expectStatus(update('teacher-a', quiz.id, withImages(IMAGE_C, null)), BAD_REQUEST_STATUS, 'Unknown image')
    expect(images.removedFiles).toEqual([])
  })

  it('PATCH чужой викторины с картинкой — 404, картинка не привязана', async () => {
    const { create, update, images } = setup()
    const quiz = await create('teacher-a', INPUT)
    images.rows.set(IMAGE_A, { teacherId: 'teacher-b', quizId: null })
    await expectNotFound(update('teacher-b', quiz.id, withImages(IMAGE_A, null)))
    expect(images.rows.get(IMAGE_A)?.quizId).toBeNull()
  })

  it('сбой удаления файла не валит сохранение; строка уже удалена, файл найдёт сверка хранилища', async () => {
    const { create, update, images } = setup()
    images.rows.set(IMAGE_A, { teacherId: 'teacher-a', quizId: null })
    const quiz = await create('teacher-a', withImages(IMAGE_A, null))
    images.failing.removeFiles = true
    const errorLog = vi.spyOn(console, 'error').mockImplementation(() => {})

    await expect(update('teacher-a', quiz.id, INPUT)).resolves.toBeDefined()
    expect(images.rows.has(IMAGE_A)).toBe(false)
    expect(errorLog).toHaveBeenCalled()
    expect(JSON.stringify(errorLog.mock.calls)).not.toContain(IMAGE_A)
  })

  it('картинку снова привязали до удаления — её строка и файл остаются', async () => {
    const { create, update, images } = setup()
    images.rows.set(IMAGE_A, { teacherId: 'teacher-a', quizId: null })
    images.rows.set(IMAGE_B, { teacherId: 'teacher-a', quizId: null })
    const quiz = await create('teacher-a', withImages(IMAGE_A, IMAGE_B))
    const deleteDetached = images.files.deleteDetached
    images.files.deleteDetached = async (ids) => {
      images.rows.set(IMAGE_A, { teacherId: 'teacher-a', quizId: 'other-quiz' })
      return deleteDetached(ids)
    }

    await update('teacher-a', quiz.id, INPUT)
    expect(images.rows.get(IMAGE_A)?.quizId).toBe('other-quiz')
    expect(images.removedFiles).toEqual([IMAGE_B])
  })

  it('сбой удаления строк — файлы не удаляются', async () => {
    const { create, update, images } = setup()
    images.rows.set(IMAGE_A, { teacherId: 'teacher-a', quizId: null })
    const quiz = await create('teacher-a', withImages(IMAGE_A, null))
    images.files.deleteDetached = async () => {
      throw new Error('db is down')
    }
    vi.spyOn(console, 'error').mockImplementation(() => {})

    await expect(update('teacher-a', quiz.id, INPUT)).resolves.toBeDefined()
    expect(images.removedFiles).toEqual([])
  })

  it('удаление викторины удаляет её картинки (файлы и строки)', async () => {
    const { create, remove, images } = setup()
    images.rows.set(IMAGE_A, { teacherId: 'teacher-a', quizId: null })
    images.rows.set(IMAGE_B, { teacherId: 'teacher-a', quizId: null })
    const quiz = await create('teacher-a', withImages(IMAGE_A, IMAGE_B))
    await remove('teacher-a', quiz.id)
    expect(images.removedFiles.sort()).toEqual([IMAGE_A, IMAGE_B])
    expect(images.rows.size).toBe(0)
  })

  it('удаление чужой викторины — 404, её картинки не тронуты', async () => {
    const { create, remove, images } = setup()
    images.rows.set(IMAGE_A, { teacherId: 'teacher-a', quizId: null })
    const quiz = await create('teacher-a', withImages(IMAGE_A, null))
    await expectNotFound(remove('teacher-b', quiz.id))
    expect(images.removedFiles).toEqual([])
    expect(images.rows.get(IMAGE_A)?.quizId).toBe(quiz.id)
  })
})
