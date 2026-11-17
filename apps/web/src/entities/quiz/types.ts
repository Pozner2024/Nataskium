import type { ImageUploadResponse } from '@nataskium/shared/schemas'

export type { GradingScaleType, QuizResult } from '@nataskium/shared/grading'
export type {
  ImageUploadResponse,
  PlayActivityResponse,
  PlayCheckInput,
  PlayCheckResponse,
  PlayFinishInput,
  PlayFinishResponse,
  PlayQuizResponse,
  QuizInput,
  QuizListResponse,
  QuizQuestion,
  QuizResponse,
  QuizSummary,
  QuizTimer,
} from '@nataskium/shared/schemas'

export type UploadedImage = ImageUploadResponse['image']
