import type { ActivityKind } from '@nataskium/shared/schemas'

export type TakeStatus = 'idle' | 'taking' | 'taken' | 'limit' | 'storage' | 'busy' | 'notFound' | 'network' | 'failed'

export type TakenQuiz = { quizId: string }

// Ответ «Взять себе» с типом копии: по нему выбирается редактор
export type TakenActivity = TakenQuiz & { type: ActivityKind }
