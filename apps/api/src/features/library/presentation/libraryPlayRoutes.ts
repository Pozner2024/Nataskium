// Игра из библиотеки по публичному номеру (ADR-0019): те же маршруты, тела и ответы, что у /api/play.
// shareToken находится на сервере на каждом запросе и клиенту не отдаётся. Фича play сюда не импортируется:
// её use-cases приходят через deps из app.ts. Тела запросов и номера не логируются
import {
  type PlayActivityResponse,
  type PlayCheckInput,
  type PlayCheckResponse,
  type PlayFinishInput,
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
import { libraryPlayNotFound } from '../application/libraryErrors'
import { parseLibraryNumber } from './parseLibraryNumber'

export const LIBRARY_PLAY_ROUTES_BASE_PATH = '/api/library/play'

// Функции игры — с той же сигнатурой, что в PlayRouterDeps: первым аргументом shareToken
export type LibraryPlayRouterDeps = {
  findShareToken: (number: number) => Promise<string>
  getPlayActivity: (shareToken: string) => Promise<PlayActivityResponse>
  checkAnswer: (shareToken: string, input: PlayCheckInput) => Promise<PlayCheckResponse>
  finishQuiz: (shareToken: string, input: PlayFinishInput) => Promise<PlayFinishResponse>
  finishMatching: (shareToken: string, input: PlayMatchingFinishInput) => Promise<PlayMatchingFinishResponse>
  checkTrueFalse: (shareToken: string, input: PlayTrueFalseCheckInput) => Promise<PlayTrueFalseCheckResponse>
  finishTrueFalse: (shareToken: string, input: PlayTrueFalseFinishInput) => Promise<PlayTrueFalseFinishResponse>
  clientIp: (c: Context) => string
  // Те же экземпляры, что у /api/play: бюджет на IP общий
  limiters: { get: RateLimiter; check: RateLimiter; finish: RateLimiter }
}

export function makeLibraryPlayRouter(deps: LibraryPlayRouterDeps) {
  const router = new Hono()
  const byIp = deps.clientIp
  // Номер разбирается после тела: невалидное тело — 400, как у /api/play
  const shareTokenOf = (c: Context) => deps.findShareToken(parseLibraryNumber(c.req.param('number') ?? '', libraryPlayNotFound))

  router.get('/:number', deps.limiters.get.middleware(byIp), async (c) => c.json(await deps.getPlayActivity(await shareTokenOf(c))))

  router.post('/:number/check', deps.limiters.check.middleware(byIp), async (c) => {
    const input = await readJsonBody(c, playCheckInputSchema)
    return c.json(await deps.checkAnswer(await shareTokenOf(c), input))
  })

  router.post('/:number/finish', deps.limiters.finish.middleware(byIp), async (c) => {
    const input = await readJsonBody(c, playFinishInputSchema)
    return c.json(await deps.finishQuiz(await shareTokenOf(c), input))
  })

  router.post('/:number/matching/finish', deps.limiters.finish.middleware(byIp), async (c) => {
    const input = await readJsonBody(c, playMatchingFinishInputSchema)
    return c.json(await deps.finishMatching(await shareTokenOf(c), input))
  })

  router.post('/:number/true-false/check', deps.limiters.check.middleware(byIp), async (c) => {
    const input = await readJsonBody(c, playTrueFalseCheckInputSchema)
    return c.json(await deps.checkTrueFalse(await shareTokenOf(c), input))
  })

  router.post('/:number/true-false/finish', deps.limiters.finish.middleware(byIp), async (c) => {
    const input = await readJsonBody(c, playTrueFalseFinishInputSchema)
    return c.json(await deps.finishTrueFalse(await shareTokenOf(c), input))
  })

  return router
}
