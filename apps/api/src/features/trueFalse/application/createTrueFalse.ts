import { MAX_ACTIVITIES_PER_TEACHER, type TrueFalseInput } from '@nataskium/shared/schemas'
import { type AppError, UnauthorizedError } from '../../../shared/errors'
import { randomShareToken } from '../../../shared/utils'
import type { TrueFalseRepository, StoredTrueFalse } from '../types'
import { activityLimitReached, unknownGroup } from './trueFalseErrors'

const CREATE_ATTEMPTS = 2

export type CreateTrueFalseDeps = {
  trueFalse: TrueFalseRepository
  generateShareToken?: () => string
}

// По умолчанию задание публикуется в библиотеку (ADR-0002); копия из библиотеки — непубличная (ADR-0005)
export type CreateTrueFalseOptions = { isPublic?: boolean }

export function makeCreateTrueFalse(deps: CreateTrueFalseDeps) {
  const generateShareToken = deps.generateShareToken ?? randomShareToken

  // Внешних ключей два: группа и учитель. Группа на месте — значит, аккаунт удалён при ещё действующем access-токене:
  // тот же 401, что и у requireAuth
  async function referenceMissingError(input: TrueFalseInput): Promise<AppError> {
    if (!(await deps.trueFalse.groupExists(input.group))) return unknownGroup()
    return new UnauthorizedError()
  }

  return async function createTrueFalse(
    teacherId: string,
    input: TrueFalseInput,
    options: CreateTrueFalseOptions = {},
  ): Promise<StoredTrueFalse> {
    const isPublic = options.isPublic ?? true
    if (!(await deps.trueFalse.groupExists(input.group))) throw unknownGroup()
    // Гонку двух параллельных созданий на последнем задании не закрываем: лимит мягкий, как у викторин
    if ((await deps.trueFalse.countByTeacher(teacherId)) >= MAX_ACTIVITIES_PER_TEACHER) throw activityLimitReached()
    for (let attempt = 1; attempt <= CREATE_ATTEMPTS; attempt++) {
      const activity = await deps.trueFalse.create(teacherId, input, generateShareToken(), isPublic)
      if (activity === 'referenceMissing') throw await referenceMissingError(input)
      if (activity !== null) return activity
    }
    throw new Error('Could not generate a unique share token')
  }
}
