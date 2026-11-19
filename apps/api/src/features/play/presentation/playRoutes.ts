// Публичные маршруты ученика: без аккаунта, по shareToken, все под лимитом по IP.
// Тела запросов и ответов не логируются: ответы ученика нигде не сохраняются
import {
  type PlayCheckInput,
  type PlayCheckResponse,
  type PlayFinishInput,
  type PlayActivityResponse,
  type PlayFinishResponse,
  type PlayMatchingFinishInput,
  type PlayMatchingFinishResponse,
  type PlayTrueFalseCheckInput,
  type PlayTrueFalseCheckResponse,
  type PlayTrueFalseFinishInput,
  type PlayTrueFalseFinishResponse,
  playCheckInputSchema,
  playFinishInputSchema,
  playMatchingFinishInputSchema,
  playTrueFalseCheckInputSchema,
  playTrueFalseFinishInputSchema,
} from '@nataskium/shared/schemas'
import { type Context, Hono } from 'hono'
import type { RateLimiter } from '../../../shared/middleware'
import { readJsonBody } from '../../../shared/utils'

export const PLAY_ROUTES_BASE_PATH = '/api/play'

export type PlayRouterDeps = {
  getPlayActivity: (shareToken: string) => Promise<PlayActivityResponse>
  checkAnswer: (shareToken: string, input: PlayCheckInput) => Promise<PlayCheckResponse>
  finishQuiz: (shareToken: string, input: PlayFinishInput) => Promise<PlayFinishResponse>
  finishMatching: (shareToken: string, input: PlayMatchingFinishInput) => Promise<PlayMatchingFinishResponse>
  checkTrueFalse: (shareToken: string, input: PlayTrueFalseCheckInput) => Promise<PlayTrueFalseCheckResponse>
  finishTrueFalse: (shareToken: string, input: PlayTrueFalseFinishInput) => Promise<PlayTrueFalseFinishResponse>
  clientIp: (c: Context) => string
  limiters: { get: RateLimiter; check: RateLimiter; finish: RateLimiter }
}

export function makePlayRouter(deps: PlayRouterDeps) {
  const router = new Hono()
  const byIp = deps.clientIp

  router.get('/:shareToken', deps.limiters.get.middleware(byIp), async (c) =>
    c.json(await deps.getPlayActivity(c.req.param('shareToken'))),
  )

  router.post('/:shareToken/check', deps.limiters.check.middleware(byIp), async (c) => {
    const input = await readJsonBody(c, playCheckInputSchema)
    return c.json(await deps.checkAnswer(c.req.param('shareToken'), input))
  })

  router.post('/:shareToken/finish', deps.limiters.finish.middleware(byIp), async (c) => {
    const input = await readJsonBody(c, playFinishInputSchema)
    return c.json(await deps.finishQuiz(c.req.param('shareToken'), input))
  })

  // Отдельный путь, а не общий /finish: у викторины [] — валидный ответ, union-тело было бы неоднозначным (ADR-0013).
  // Тот же лимитер finish: бюджет на IP общий
  router.post('/:shareToken/matching/finish', deps.limiters.finish.middleware(byIp), async (c) => {
    const input = await readJsonBody(c, playMatchingFinishInputSchema)
    return c.json(await deps.finishMatching(c.req.param('shareToken'), input))
  })

  // Свои пути, как у сопоставления; лимитеры те же: бюджет на IP общий
  router.post('/:shareToken/true-false/check', deps.limiters.check.middleware(byIp), async (c) => {
    const input = await readJsonBody(c, playTrueFalseCheckInputSchema)
    return c.json(await deps.checkTrueFalse(c.req.param('shareToken'), input))
  })

  router.post('/:shareToken/true-false/finish', deps.limiters.finish.middleware(byIp), async (c) => {
    const input = await readJsonBody(c, playTrueFalseFinishInputSchema)
    return c.json(await deps.finishTrueFalse(c.req.param('shareToken'), input))
  })

  return router
}
