import type { QuizInput } from '@nataskium/shared/schemas'

export type StoredQuiz = QuizInput & { id: string; shareToken: string; updatedAt: Date }

// Каждый метод с teacherId сам проверяет владельца и deletedAt: чужая и удалённая викторины неотличимы от отсутствующей
export type QuizRepository = {
  listByTeacher(teacherId: string): Promise<StoredQuiz[]>
  // Только неудалённые
  countByTeacher(teacherId: string): Promise<number>
  findOwned(id: string, teacherId: string): Promise<StoredQuiz | null>
  // null — shareToken уже занят (одна повторная попытка с новым токеном делается в use-case)
  create(teacherId: string, input: QuizInput, shareToken: string): Promise<StoredQuiz | null>
  updateOwned(id: string, teacherId: string, input: QuizInput): Promise<boolean>
  softDeleteOwned(id: string, teacherId: string): Promise<boolean>
  // Для ученика: без владельца, но удалённая не находится
  findByShareToken(token: string): Promise<StoredQuiz | null>
}
