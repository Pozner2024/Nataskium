export type QuizType = 'choice' | 'truefalse' | 'picture' | 'gap'

export interface QuizQuestion {
  type: QuizType
  text: string
  options: string[]
  answer: number
}
