// Публичные маршруты ученика: без аккаунта, по shareToken, все под лимитом по IP.
// Тела запросов и ответов не логируются: ответы ученика нигде не сохраняются
import {
  type PlayCheckInput,
  type PlayCheckResponse,
  type PlayFinishInput,
  type PlayFinishResponse,
  type PlayQuizResponse,
  playCheckInputSchema,
  playFinishInputSchema,
} from '@nataskium/shared/schemas'
import { type Context, Hono } from 'hono'
import type { RateLimiter } from '../../../shared/middleware'
import { readJsonBody } from '../../../shared/utils'

export const PLAY_ROUTES_BASE_PATH = '/api/play'

export type PlayRouterDeps = {
  getPlayQuiz: (shareToken: string) => Promise<PlayQuizResponse>
  checkAnswer: (shareToken: string, input: PlayCheckInput) => Promise<PlayCheckResponse>
  finishQuiz: (shareToken: string, input: PlayFinishInput) => Promise<PlayFinishResponse>
  clientIp: (c: Context) => string
  limiters: { get: RateLimiter; check: RateLimiter; finish: RateLimiter }
}

export function makePlayRouter(deps: PlayRouterDeps) {
  const router = new Hono()
  const byIp = deps.clientIp

  router.get('/:shareToken', deps.limiters.get.middleware(byIp), async (c) =>
    c.json(await deps.getPlayQuiz(c.req.param('shareToken'))),
  )

  router.post('/:shareToken/check', deps.limiters.check.middleware(byIp), async (c) => {
    const input = await readJsonBody(c, playCheckInputSchema)
    return c.json(await deps.checkAnswer(c.req.param('shareToken'), input))
  })

  router.post('/:shareToken/finish', deps.limiters.finish.middleware(byIp), async (c) => {
    const input = await readJsonBody(c, playFinishInputSchema)
    return c.json(await deps.finishQuiz(c.req.param('shareToken'), input))
  })

  return router
}
