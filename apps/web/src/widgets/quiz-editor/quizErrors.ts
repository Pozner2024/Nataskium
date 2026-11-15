import { MAX_OPTIONS, MAX_QUESTIONS, MIN_OPTIONS, MIN_QUESTIONS } from '@nataskium/shared/schemas'
import type { Translate } from '@/features/auth'

const ISSUE_MESSAGES: { prefix: string; key: string; params?: Record<string, unknown> }[] = [
  { prefix: 'Text is required', key: 'teacher.quizEditor.errors.required' },
  { prefix: 'Text or image is required', key: 'teacher.quizEditor.errors.textOrImage' },
  { prefix: 'Text must be at most', key: 'teacher.quizEditor.errors.tooLong' },
  { prefix: 'At least one option must be correct', key: 'teacher.quizEditor.errors.noCorrect' },
  { prefix: 'At least one option must be incorrect', key: 'teacher.quizEditor.errors.noIncorrect' },
  { prefix: 'At least', key: 'teacher.quizEditor.errors.optionsMin', params: { min: MIN_OPTIONS } },
  { prefix: 'At most', key: 'teacher.quizEditor.errors.optionsMax', params: { max: MAX_OPTIONS } },
]

const QUESTIONS_MESSAGES: { prefix: string; key: string; params: Record<string, unknown> }[] = [
  { prefix: 'At least', key: 'teacher.quizEditor.errors.questionsMin', params: { min: MIN_QUESTIONS } },
  { prefix: 'At most', key: 'teacher.quizEditor.errors.questionsMax', params: { max: MAX_QUESTIONS } },
]

// Тексты схем (английские, одинаковые на сервере и в браузере) → текст у поля на языке интерфейса.
// key — путь ошибки через точку; предел длины берётся из самого сообщения схемы
export function issueText(key: string, message: string, t: Translate): string {
  const table = key === 'questions' ? QUESTIONS_MESSAGES : ISSUE_MESSAGES
  const match = table.find((item) => message.startsWith(item.prefix))
  if (!match) return t('teacher.quizEditor.errors.invalid')
  const max = /at most (\d+) characters/.exec(message)?.[1]
  return t(match.key, { ...match.params, ...(max ? { max: Number(max) } : {}) })
}
