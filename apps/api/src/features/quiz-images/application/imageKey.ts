export const QUIZ_IMAGE_KEY_PREFIX = 'quiz-images/'

// Ключ не содержит id учителя и не зависит от правильности ответа
export function quizImageKey(imageId: string): string {
  return `${QUIZ_IMAGE_KEY_PREFIX}${imageId}.webp`
}
