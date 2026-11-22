// Кабинет учителя: все маршруты под requireAuth и лимитами на учителя, владелец проверяется в каждом use-case
import {
  type QuizInput,
  type QuizListResponse,
  type QuizResponse,
  type QuizSummary,
  quizIdSchema,
  quizInputSchema,
} from '@nataskium/shared/schemas'
import { type Context, Hono, type MiddlewareHandler } from 'hono'
import type { RateLimiter } from '../../../shared/middleware'
import { readJsonBody } from '../../../shared/utils'
import { quizNotFound } from '../application/quizErrors'
import type { StoredQuiz } from '../types'

export const QUIZ_ROUTES_BASE_PATH = '/api/quizzes'

const CREATED_STATUS = 201
const NO_CONTENT_STATUS = 204

export type QuizRouterDeps = {
  listQuizzes: (teacherId: string) => Promise<QuizSummary[]>
  getQuiz: (teacherId: string, id: string) => Promise<StoredQuiz>
  createQuiz: (teacherId: string, input: QuizInput) => Promise<StoredQuiz>
  updateQuiz: (teacherId: string, id: string, input: QuizInput) => Promise<StoredQuiz>
  deleteQuiz: (teacherId: string, id: string) => Promise<void>
  // null — хранилище не настроено
  imageUrl: (imageId: string) => string | null
  requireAuth: MiddlewareHandler
  // write — общий на POST, PATCH и DELETE; create — дополнительно на POST
  limiters: { read: RateLimiter; write: RateLimiter; create: RateLimiter }
}

type ImageUrl = QuizRouterDeps['imageUrl']

const urlOf = (imageUrl: ImageUrl, imageId: string | null) => (imageId === null ? null : imageUrl(imageId))

// Адрес картинки строит сервер из id: клиент присылает только imageId
function toQuizResponse(quiz: StoredQuiz, imageUrl: ImageUrl): QuizResponse {
  return {
    quiz: {
      id: quiz.id,
      title: quiz.title,
      showAnswers: quiz.showAnswers,
      gradingScale: quiz.gradingScale,
      group: quiz.group,
      timer: quiz.timer,
      introTheme: quiz.introTheme,
      questions: quiz.questions.map((question) => ({
        ...question,
        imageUrl: urlOf(imageUrl, question.imageId),
        options: question.options.map((option) => ({ ...option, imageUrl: urlOf(imageUrl, option.imageId) })),
      })),
      shareToken: quiz.shareToken,
    },
  }
}

// Невалидный id — тот же 404, что и чужая викторина: по ответу не отличить
function parseId(raw: string): string {
  const parsed = quizIdSchema.safeParse(raw)
  if (!parsed.success) throw quizNotFound()
  return parsed.data
}

export function makeQuizRouter(deps: QuizRouterDeps) {
  const router = new Hono()
  // После requireAuth: ключ — teacherId из проверенного токена
  const byTeacher = (c: Context) => c.get('teacherId')
  const readLimit = deps.limiters.read.middleware(byTeacher)
  const writeLimit = deps.limiters.write.middleware(byTeacher)
  const createLimit = deps.limiters.create.middleware(byTeacher)
  router.use(deps.requireAuth)

  router.get('/', readLimit, async (c) => {
    const response: QuizListResponse = { quizzes: await deps.listQuizzes(c.get('teacherId')) }
    return c.json(response)
  })

  router.post('/', writeLimit, createLimit, async (c) => {
    const input = await readJsonBody(c, quizInputSchema)
    const quiz = await deps.createQuiz(c.get('teacherId'), input)
    return c.json(toQuizResponse(quiz, deps.imageUrl), CREATED_STATUS)
  })

  router.get('/:id', readLimit, async (c) => {
    const quiz = await deps.getQuiz(c.get('teacherId'), parseId(c.req.param('id')))
    return c.json(toQuizResponse(quiz, deps.imageUrl))
  })

  router.patch('/:id', writeLimit, async (c) => {
    const id = parseId(c.req.param('id'))
    const input = await readJsonBody(c, quizInputSchema)
    const quiz = await deps.updateQuiz(c.get('teacherId'), id, input)
    return c.json(toQuizResponse(quiz, deps.imageUrl))
  })

  router.delete('/:id', writeLimit, async (c) => {
    await deps.deleteQuiz(c.get('teacherId'), parseId(c.req.param('id')))
    return c.body(null, NO_CONTENT_STATUS)
  })

  return router
}
