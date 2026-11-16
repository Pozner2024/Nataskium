// Публичная библиотека: чтение без аккаунта, все маршруты под лимитом по IP; «Взять себе» — только под Bearer.
// Поисковые запросы и номера не логируются
import {
  type LibraryGroupsResponse,
  type LibraryListQuery,
  type LibraryListResponse,
  type LibraryQuizResponse,
  type LibraryTakeResponse,
  libraryListQuerySchema,
  libraryNumberSchema,
} from '@nataskium/shared/schemas'
import { type Context, Hono, type MiddlewareHandler } from 'hono'
import { ValidationError } from '../../../shared/errors'
import type { RateLimiter } from '../../../shared/middleware'
import { libraryNotFound } from '../application/libraryErrors'

export const LIBRARY_ROUTES_BASE_PATH = '/api/library'

const CREATED_STATUS = 201

export type LibraryRouterDeps = {
  listLibraryGroups: () => Promise<LibraryGroupsResponse>
  listLibraryQuizzes: (query: LibraryListQuery) => Promise<LibraryListResponse>
  getLibraryQuiz: (number: number) => Promise<LibraryQuizResponse>
  takeLibraryQuiz: (teacherId: string, number: number) => Promise<LibraryTakeResponse>
  requireAuth: MiddlewareHandler
  clientIp: (c: Context) => string
  limiters: {
    groups: RateLimiter
    list: RateLimiter
    search: RateLimiter
    quiz: RateLimiter
    takePerIp: RateLimiter
    takePerTeacher: RateLimiter
  }
}

function parseListQuery(c: Context): LibraryListQuery {
  const result = libraryListQuerySchema.safeParse(c.req.query())
  if (result.success) return result.data
  throw new ValidationError(result.error.issues.map((issue) => ({ path: issue.path.map(String), message: issue.message })))
}

// Невалидный номер — тот же 404, что и отсутствующее задание
function parseNumber(raw: string): number {
  const parsed = libraryNumberSchema.safeParse(raw)
  if (!parsed.success) throw libraryNotFound()
  return parsed.data
}

export function makeLibraryRouter(deps: LibraryRouterDeps) {
  const router = new Hono()
  const byIp = deps.clientIp
  const searchLimit = deps.limiters.search.middleware(byIp)
  const limitSearch: MiddlewareHandler = (c, next) => (c.req.query('q') === undefined ? next() : searchLimit(c, next))

  router.get('/groups', deps.limiters.groups.middleware(byIp), async (c) => c.json(await deps.listLibraryGroups()))

  router.get('/', deps.limiters.list.middleware(byIp), limitSearch, async (c) =>
    c.json(await deps.listLibraryQuizzes(parseListQuery(c))),
  )

  router.get('/:number', deps.limiters.quiz.middleware(byIp), async (c) =>
    c.json(await deps.getLibraryQuiz(parseNumber(c.req.param('number')))),
  )

  // Лимит по IP раньше проверки токена: неавторизованный поток не должен доходить до верификации
  router.post(
    '/:number/take',
    deps.limiters.takePerIp.middleware(byIp),
    deps.requireAuth,
    deps.limiters.takePerTeacher.middleware((c) => c.get('teacherId')),
    async (c) => {
      const response = await deps.takeLibraryQuiz(c.get('teacherId'), parseNumber(c.req.param('number')))
      return c.json(response, CREATED_STATUS)
    },
  )

  return router
}
