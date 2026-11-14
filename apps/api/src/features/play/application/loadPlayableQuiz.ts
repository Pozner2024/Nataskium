import { shareTokenSchema } from '@nataskium/shared/schemas'
import type { PlayQuizSource, PlayableQuiz } from '../types'
import { playQuizNotFound } from './playErrors'

export async function loadPlayableQuiz(source: PlayQuizSource, shareToken: string): Promise<PlayableQuiz> {
  // Невалидный по формату токен — тот же 404, что и отсутствующий, без обращения к БД
  if (!shareTokenSchema.safeParse(shareToken).success) throw playQuizNotFound()
  const quiz = await source.findByShareToken(shareToken)
  if (quiz === null) throw playQuizNotFound()
  return quiz
}
