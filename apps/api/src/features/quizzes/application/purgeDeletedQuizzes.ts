import type { QuizRepository } from '../types'

const MS_PER_DAY = 24 * 60 * 60 * 1000
const DELETED_QUIZ_RETENTION_DAYS = 30
// Удалённое учителем задание хранится столько, потом строка удаляется физически: без этого цикл
// «создать → удалить» раздувал бы таблицу без предела (лимит заданий считает только неудалённые)
export const DELETED_QUIZ_RETENTION_MS = DELETED_QUIZ_RETENTION_DAYS * MS_PER_DAY

export type PurgeDeletedQuizzesDeps = {
  quizzes: QuizRepository
  now: () => Date
}

// Картинки отвязаны и удалены ещё при мягком удалении; привязанные по гонке получат quiz_id = NULL
// (ON DELETE SET NULL) и уйдут с очисткой картинок. Сбой не роняет процесс — следующий запуск повторит
export function makePurgeDeletedQuizzes(deps: PurgeDeletedQuizzesDeps) {
  return async function purgeDeletedQuizzes(): Promise<void> {
    const olderThan = new Date(deps.now().getTime() - DELETED_QUIZ_RETENTION_MS)
    try {
      const quizzes = await deps.quizzes.purgeDeletedBefore(olderThan)
      if (quizzes > 0) console.log('[quiz-cleanup] deleted quizzes purged', { quizzes })
    } catch (error) {
      // Только тип: в ошибке Prisma бывают параметры запроса
      console.error('[quiz-cleanup] failed', { errorType: error instanceof Error ? error.name : typeof error })
    }
  }
}
