import type { TrueFalseInput } from '@nataskium/shared/schemas'

export type StoredTrueFalse = TrueFalseInput & { id: string; shareToken: string; updatedAt: Date }

// Каждый метод с teacherId сам проверяет владельца, тип и deletedAt: чужое, удалённое и задание другого типа
// неотличимы от отсутствующего
export type TrueFalseRepository = {
  // Задания всех типов, только неудалённые: лимит общий (ADR-0013, ADR-0016)
  countByTeacher(teacherId: string): Promise<number>
  groupExists(slug: string): Promise<boolean>
  findOwned(id: string, teacherId: string): Promise<StoredTrueFalse | null>
  // null — shareToken уже занят (повторная попытка с новым токеном делается в use-case);
  // 'referenceMissing' — нет учителя или группы (внешний ключ), причину выясняет use-case.
  // isPublic по умолчанию true (ADR-0002); копия из библиотеки — false (ADR-0005)
  create(teacherId: string, input: TrueFalseInput, shareToken: string, isPublic?: boolean): Promise<StoredTrueFalse | null | 'referenceMissing'>
  updateOwned(id: string, teacherId: string, input: TrueFalseInput): Promise<boolean>
  softDeleteOwned(id: string, teacherId: string): Promise<boolean>
  // Для ученика: без владельца, но удалённое и задание другого типа не находятся
  findByShareToken(token: string): Promise<StoredTrueFalse | null>
}
