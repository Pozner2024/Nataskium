// Версия викторины для ученика: меняется при любой правке учителем
export const quizVersion = (quiz: { updatedAt: Date }): string => quiz.updatedAt.toISOString()
