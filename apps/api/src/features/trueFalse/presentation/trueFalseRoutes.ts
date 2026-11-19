// Кабинет учителя, задания да/нет: все маршруты под requireAuth и общими с викторинами лимитами на учителя.
// Список — общий GET /api/quizzes. Владелец проверяется в каждом use-case
import { type TrueFalseInput, type TrueFalseResponse, trueFalseInputSchema, quizIdSchema } from '@nataskium/shared/schemas'
import { type Context, Hono, type MiddlewareHandler } from 'hono'
import type { RateLimiter } from '../../../shared/middleware'
import { readJsonBody } from '../../../shared/utils'
import { trueFalseNotFound } from '../application/trueFalseErrors'
import type { StoredTrueFalse } from '../types'

export const TRUE_FALSE_ROUTES_BASE_PATH = '/api/true-false'

const CREATED_STATUS = 201
const NO_CONTENT_STATUS = 204

export type TrueFalseRouterDeps = {
  getTrueFalse: (teacherId: string, id: string) => Promise<StoredTrueFalse>
  createTrueFalse: (teacherId: string, input: TrueFalseInput) => Promise<StoredTrueFalse>
  updateTrueFalse: (teacherId: string, id: string, input: TrueFalseInput) => Promise<StoredTrueFalse>
  deleteTrueFalse: (teacherId: string, id: string) => Promise<void>
  requireAuth: MiddlewareHandler
  // Те же экземпляры, что у викторин: квота учителя общая. write — на POST, PATCH и DELETE; create — дополнительно на POST
  limiters: { read: RateLimiter; write: RateLimiter; create: RateLimiter }
}

// Явная сборка: updatedAt и прочие служебные поля в ответ не попадают
function toTrueFalseResponse(activity: StoredTrueFalse): TrueFalseResponse {
  return {
    trueFalse: {
      id: activity.id,
      title: activity.title,
      showAnswers: activity.showAnswers,
      gradingScale: activity.gradingScale,
      group: activity.group,
      timer: activity.timer,
      items: activity.items.map(({ statement, answer }) => ({ statement, answer })),
      shareToken: activity.shareToken,
    },
  }
}

// Невалидный id — тот же 404, что и чужое задание: по ответу не отличить
function parseId(raw: string): string {
  const parsed = quizIdSchema.safeParse(raw)
  if (!parsed.success) throw trueFalseNotFound()
  return parsed.data
}

export function makeTrueFalseRouter(deps: TrueFalseRouterDeps) {
  const router = new Hono()
  // После requireAuth: ключ — teacherId из проверенного токена
  const byTeacher = (c: Context) => c.get('teacherId')
  const readLimit = deps.limiters.read.middleware(byTeacher)
  const writeLimit = deps.limiters.write.middleware(byTeacher)
  const createLimit = deps.limiters.create.middleware(byTeacher)
  router.use(deps.requireAuth)

  router.post('/', writeLimit, createLimit, async (c) => {
    const input = await readJsonBody(c, trueFalseInputSchema)
    const activity = await deps.createTrueFalse(c.get('teacherId'), input)
    return c.json(toTrueFalseResponse(activity), CREATED_STATUS)
  })

  router.get('/:id', readLimit, async (c) => {
    const activity = await deps.getTrueFalse(c.get('teacherId'), parseId(c.req.param('id')))
    return c.json(toTrueFalseResponse(activity))
  })

  router.patch('/:id', writeLimit, async (c) => {
    const id = parseId(c.req.param('id'))
    const input = await readJsonBody(c, trueFalseInputSchema)
    const activity = await deps.updateTrueFalse(c.get('teacherId'), id, input)
    return c.json(toTrueFalseResponse(activity))
  })

  router.delete('/:id', writeLimit, async (c) => {
    await deps.deleteTrueFalse(c.get('teacherId'), parseId(c.req.param('id')))
    return c.body(null, NO_CONTENT_STATUS)
  })

  return router
}
