import type { MatchingInput } from '@nataskium/shared/schemas'

export type StoredMatching = MatchingInput & { id: string; shareToken: string; updatedAt: Date }

// Каждый метод с teacherId сам проверяет владельца, тип и deletedAt: чужое, удалённое и задание другого типа
// неотличимы от отсутствующего
export type MatchingRepository = {
  // Задания всех типов, только неудалённые: лимит общий (ADR-0013)
  countByTeacher(teacherId: string): Promise<number>
  groupExists(slug: string): Promise<boolean>
  findOwned(id: string, teacherId: string): Promise<StoredMatching | null>
  // null — shareToken уже занят (повторная попытка с новым токеном делается в use-case);
  // 'referenceMissing' — нет учителя или группы (внешний ключ), причину выясняет use-case.
  // isPublic по умолчанию true (ADR-0002); копия из библиотеки — false (ADR-0005)
  create(teacherId: string, input: MatchingInput, shareToken: string, isPublic?: boolean): Promise<StoredMatching | null | 'referenceMissing'>
  updateOwned(id: string, teacherId: string, input: MatchingInput): Promise<boolean>
  softDeleteOwned(id: string, teacherId: string): Promise<boolean>
}
