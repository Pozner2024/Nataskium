import { MAX_TRUE_FALSE_ITEMS, MIN_TRUE_FALSE_ITEMS } from '@nataskium/shared/schemas'
import type { Translate } from '@/features/auth'
import { ANSWER_REQUIRED_MESSAGE, type FieldError } from './store'

type IssueMessage = { prefix: string; key: string; params?: Record<string, unknown> }

const FIELD_MESSAGES: IssueMessage[] = [
  { prefix: 'Invalid group', key: 'teacher.trueFalseEditor.errors.groupRequired' },
  { prefix: 'Text is required', key: 'teacher.trueFalseEditor.errors.required' },
  { prefix: 'Text must be at most', key: 'teacher.trueFalseEditor.errors.tooLong' },
  { prefix: 'Text contains invalid characters', key: 'teacher.trueFalseEditor.errors.invalidChars' },
  { prefix: 'Duplicate text', key: 'teacher.trueFalseEditor.errors.duplicate' },
]

const ITEMS_MESSAGES: IssueMessage[] = [
  { prefix: 'At least', key: 'teacher.trueFalseEditor.errors.itemsMin', params: { min: MIN_TRUE_FALSE_ITEMS } },
  { prefix: 'At most', key: 'teacher.trueFalseEditor.errors.itemsMax', params: { max: MAX_TRUE_FALSE_ITEMS } },
]

const ANSWER_TYPE_MESSAGE_PREFIX = 'Invalid input: expected boolean'

function answerText(error: FieldError, t: Translate): string {
  const unanswered = error.message === ANSWER_REQUIRED_MESSAGE || error.message.startsWith(ANSWER_TYPE_MESSAGE_PREFIX)
  return t(unanswered ? 'teacher.trueFalseEditor.errors.answerRequired' : 'teacher.trueFalseEditor.errors.invalid')
}

// Тексты схем (английские, одинаковые на сервере и в браузере) → текст у поля на языке интерфейса.
// key — путь ошибки через точку; предел длины берётся из самого сообщения схемы
export function issueText(key: string, error: FieldError, t: Translate): string {
  if (key.endsWith('.answer')) return answerText(error, t)
  if (error.partner !== undefined) return t('teacher.trueFalseEditor.errors.duplicateStatement', { n: error.partner })
  const table = key === 'items' ? ITEMS_MESSAGES : FIELD_MESSAGES
  const match = table.find((item) => error.message.startsWith(item.prefix))
  if (!match) return t('teacher.trueFalseEditor.errors.invalid')
  const max = /at most (\d+) characters/.exec(error.message)?.[1]
  return t(match.key, { ...match.params, ...(max ? { max: Number(max) } : {}) })
}
