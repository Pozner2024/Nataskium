// Кабинет учителя: все маршруты под requireAuth, владелец проверяется в каждом use-case
import {
  type QuizInput,
  type QuizListResponse,
  type QuizResponse,
  quizIdSchema,
  quizInputSchema,
} from '@nataskium/shared/schemas'
import { Hono, type MiddlewareHandler } from 'hono'
import { readJsonBody } from '../../../shared/utils'
import { quizNotFound } from '../application/quizErrors'
import type { StoredQuiz } from '../types'

export const QUIZ_ROUTES_BASE_PATH = '/api/quizzes'

const CREATED_STATUS = 201
const NO_CONTENT_STATUS = 204

export type QuizRouterDeps = {
  listQuizzes: (teacherId: string) => Promise<StoredQuiz[]>
  getQuiz: (teacherId: string, id: string) => Promise<StoredQuiz>
  createQuiz: (teacherId: string, input: QuizInput) => Promise<StoredQuiz>
  updateQuiz: (teacherId: string, id: string, input: QuizInput) => Promise<StoredQuiz>
  deleteQuiz: (teacherId: string, id: string) => Promise<void>
  requireAuth: MiddlewareHandler
}

function toQuizResponse(quiz: StoredQuiz): QuizResponse {
  return {
    quiz: {
      id: quiz.id,
      title: quiz.title,
      showAnswers: quiz.showAnswers,
      gradingScale: quiz.gradingScale,
      questions: quiz.questions,
      shareToken: quiz.shareToken,
    },
  }
}

function toListResponse(quizzes: StoredQuiz[]): QuizListResponse {
  return {
    quizzes: quizzes.map((quiz) => ({
      id: quiz.id,
      title: quiz.title,
      questionCount: quiz.questions.length,
      gradingScale: quiz.gradingScale,
      shareToken: quiz.shareToken,
    })),
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
  router.use(deps.requireAuth)

  router.get('/', async (c) => c.json(toListResponse(await deps.listQuizzes(c.get('teacherId')))))

  router.post('/', async (c) => {
    const input = await readJsonBody(c, quizInputSchema)
    const quiz = await deps.createQuiz(c.get('teacherId'), input)
    return c.json(toQuizResponse(quiz), CREATED_STATUS)
  })

  router.get('/:id', async (c) => {
    const quiz = await deps.getQuiz(c.get('teacherId'), parseId(c.req.param('id')))
    return c.json(toQuizResponse(quiz))
  })

  router.patch('/:id', async (c) => {
    const id = parseId(c.req.param('id'))
    const input = await readJsonBody(c, quizInputSchema)
    const quiz = await deps.updateQuiz(c.get('teacherId'), id, input)
    return c.json(toQuizResponse(quiz))
  })

  router.delete('/:id', async (c) => {
    await deps.deleteQuiz(c.get('teacherId'), parseId(c.req.param('id')))
    return c.body(null, NO_CONTENT_STATUS)
  })

  return router
}
