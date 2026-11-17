import { shareTokenSchema } from '@nataskium/shared/schemas'
import { playQuizNotFound } from './playErrors'

// Источник викторин или сопоставлений: каждый находит только свой тип
type PlayableSource<T> = { findByShareToken(token: string): Promise<T | null> }

export function isShareTokenFormat(shareToken: string): boolean {
  return shareTokenSchema.safeParse(shareToken).success
}

export async function loadPlayableQuiz<T>(source: PlayableSource<T>, shareToken: string): Promise<T> {
  // Невалидный по формату токен — тот же 404, что и отсутствующий, без обращения к БД
  if (!isShareTokenFormat(shareToken)) throw playQuizNotFound()
  const quiz = await source.findByShareToken(shareToken)
  if (quiz === null) throw playQuizNotFound()
  return quiz
}
