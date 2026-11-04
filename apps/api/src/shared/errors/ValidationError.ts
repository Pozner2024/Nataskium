import { AppError } from './AppError'

const INVALID_REQUEST_MESSAGE = 'Invalid request'
const BAD_REQUEST_STATUS = 400

// Только путь и текст: исходные значения в ответ не попадают
export type ValidationIssue = { path: string[]; message: string }

export class ValidationError extends AppError {
  readonly issues: readonly ValidationIssue[]

  constructor(issues: readonly ValidationIssue[]) {
    super(BAD_REQUEST_STATUS, INVALID_REQUEST_MESSAGE)
    this.name = 'ValidationError'
    this.issues = issues
  }
}
