// Кабинет учителя, сопоставления: все маршруты под requireAuth и общими с викторинами лимитами на учителя.
// Список — общий GET /api/quizzes. Владелец проверяется в каждом use-case
import { type MatchingInput, type MatchingResponse, matchingInputSchema, quizIdSchema } from '@nataskium/shared/schemas'
import { type Context, Hono, type MiddlewareHandler } from 'hono'
import type { RateLimiter } from '../../../shared/middleware'
import { readJsonBody } from '../../../shared/utils'
import { matchingNotFound } from '../application/matchingErrors'
import type { StoredMatching } from '../types'

export const MATCHING_ROUTES_BASE_PATH = '/api/matchings'

const CREATED_STATUS = 201
const NO_CONTENT_STATUS = 204

export type MatchingRouterDeps = {
  getMatching: (teacherId: string, id: string) => Promise<StoredMatching>
  createMatching: (teacherId: string, input: MatchingInput) => Promise<StoredMatching>
  updateMatching: (teacherId: string, id: string, input: MatchingInput) => Promise<StoredMatching>
  deleteMatching: (teacherId: string, id: string) => Promise<void>
  requireAuth: MiddlewareHandler
  // Те же экземпляры, что у викторин: квота учителя общая. write — на POST, PATCH и DELETE; create — дополнительно на POST
  limiters: { read: RateLimiter; write: RateLimiter; create: RateLimiter }
}

// Явная сборка: updatedAt и прочие служебные поля в ответ не попадают
function toMatchingResponse(matching: StoredMatching): MatchingResponse {
  return {
    matching: {
      id: matching.id,
      title: matching.title,
      showAnswers: matching.showAnswers,
      gradingScale: matching.gradingScale,
      group: matching.group,
      timer: matching.timer,
      pairs: matching.pairs.map(({ term, definition }) => ({ term, definition })),
      shareToken: matching.shareToken,
    },
  }
}

// Невалидный id — тот же 404, что и чужое задание: по ответу не отличить
function parseId(raw: string): string {
  const parsed = quizIdSchema.safeParse(raw)
  if (!parsed.success) throw matchingNotFound()
  return parsed.data
}

export function makeMatchingRouter(deps: MatchingRouterDeps) {
  const router = new Hono()
  // После requireAuth: ключ — teacherId из проверенного токена
  const byTeacher = (c: Context) => c.get('teacherId')
  const readLimit = deps.limiters.read.middleware(byTeacher)
  const writeLimit = deps.limiters.write.middleware(byTeacher)
  const createLimit = deps.limiters.create.middleware(byTeacher)
  router.use(deps.requireAuth)

  router.post('/', writeLimit, createLimit, async (c) => {
    const input = await readJsonBody(c, matchingInputSchema)
    const matching = await deps.createMatching(c.get('teacherId'), input)
    return c.json(toMatchingResponse(matching), CREATED_STATUS)
  })

  router.get('/:id', readLimit, async (c) => {
    const matching = await deps.getMatching(c.get('teacherId'), parseId(c.req.param('id')))
    return c.json(toMatchingResponse(matching))
  })

  router.patch('/:id', writeLimit, async (c) => {
    const id = parseId(c.req.param('id'))
    const input = await readJsonBody(c, matchingInputSchema)
    const matching = await deps.updateMatching(c.get('teacherId'), id, input)
    return c.json(toMatchingResponse(matching))
  })

  router.delete('/:id', writeLimit, async (c) => {
    await deps.deleteMatching(c.get('teacherId'), parseId(c.req.param('id')))
    return c.body(null, NO_CONTENT_STATUS)
  })

  return router
}
