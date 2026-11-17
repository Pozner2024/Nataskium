import { MAX_MATCHING_PAIRS, MIN_MATCHING_PAIRS } from '@nataskium/shared/schemas'
import type { Translate } from '@/features/auth'
import type { FieldError } from './store'

type IssueMessage = { prefix: string; key: string; params?: Record<string, unknown> }

const FIELD_MESSAGES: IssueMessage[] = [
  { prefix: 'Invalid group', key: 'teacher.matchingEditor.errors.groupRequired' },
  { prefix: 'Text is required', key: 'teacher.matchingEditor.errors.required' },
  { prefix: 'Text must be at most', key: 'teacher.matchingEditor.errors.tooLong' },
  { prefix: 'Text contains invalid characters', key: 'teacher.matchingEditor.errors.invalidChars' },
  { prefix: 'Duplicate text', key: 'teacher.matchingEditor.errors.duplicate' },
]

const PAIRS_MESSAGES: IssueMessage[] = [
  { prefix: 'At least', key: 'teacher.matchingEditor.errors.pairsMin', params: { min: MIN_MATCHING_PAIRS } },
  { prefix: 'At most', key: 'teacher.matchingEditor.errors.pairsMax', params: { max: MAX_MATCHING_PAIRS } },
]

// Тексты схем (английские, одинаковые на сервере и в браузере) → текст у поля на языке интерфейса.
// key — путь ошибки через точку; предел длины берётся из самого сообщения схемы
export function issueText(key: string, error: FieldError, t: Translate): string {
  if (error.partner !== undefined) {
    const duplicateKey = key.endsWith('.term') ? 'duplicateTerm' : 'duplicateDefinition'
    return t(`teacher.matchingEditor.errors.${duplicateKey}`, { n: error.partner })
  }
  const table = key === 'pairs' ? PAIRS_MESSAGES : FIELD_MESSAGES
  const match = table.find((item) => error.message.startsWith(item.prefix))
  if (!match) return t('teacher.matchingEditor.errors.invalid')
  const max = /at most (\d+) characters/.exec(error.message)?.[1]
  return t(match.key, { ...match.params, ...(max ? { max: Number(max) } : {}) })
}
