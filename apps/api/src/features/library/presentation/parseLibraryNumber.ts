import { libraryNumberSchema } from '@nataskium/shared/schemas'
import type { AppError } from '../../../shared/errors'

// Невалидный номер — тот же 404, что и отсутствующее задание, без обращения к БД
export function parseLibraryNumber(raw: string, notFound: () => AppError): number {
  const parsed = libraryNumberSchema.safeParse(raw)
  if (!parsed.success) throw notFound()
  return parsed.data
}
