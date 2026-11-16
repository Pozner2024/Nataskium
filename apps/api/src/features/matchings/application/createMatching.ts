import { MAX_ACTIVITIES_PER_TEACHER, type MatchingInput } from '@nataskium/shared/schemas'
import { type AppError, UnauthorizedError } from '../../../shared/errors'
import { randomShareToken } from '../../../shared/utils'
import type { MatchingRepository, StoredMatching } from '../types'
import { activityLimitReached, unknownGroup } from './matchingErrors'

const CREATE_ATTEMPTS = 2

export type CreateMatchingDeps = {
  matchings: MatchingRepository
  generateShareToken?: () => string
}

// По умолчанию задание публикуется в библиотеку (ADR-0002); копия из библиотеки — непубличная (ADR-0005)
export type CreateMatchingOptions = { isPublic?: boolean }

export function makeCreateMatching(deps: CreateMatchingDeps) {
  const generateShareToken = deps.generateShareToken ?? randomShareToken

  // Внешних ключей два: группа и учитель. Группа на месте — значит, аккаунт удалён при ещё действующем access-токене:
  // тот же 401, что и у requireAuth
  async function referenceMissingError(input: MatchingInput): Promise<AppError> {
    if (!(await deps.matchings.groupExists(input.group))) return unknownGroup()
    return new UnauthorizedError()
  }

  return async function createMatching(
    teacherId: string,
    input: MatchingInput,
    options: CreateMatchingOptions = {},
  ): Promise<StoredMatching> {
    const isPublic = options.isPublic ?? true
    if (!(await deps.matchings.groupExists(input.group))) throw unknownGroup()
    // Гонку двух параллельных созданий на последнем задании не закрываем: лимит мягкий, как у викторин
    if ((await deps.matchings.countByTeacher(teacherId)) >= MAX_ACTIVITIES_PER_TEACHER) throw activityLimitReached()
    for (let attempt = 1; attempt <= CREATE_ATTEMPTS; attempt++) {
      const matching = await deps.matchings.create(teacherId, input, generateShareToken(), isPublic)
      if (matching === 'referenceMissing') throw await referenceMissingError(input)
      if (matching !== null) return matching
    }
    throw new Error('Could not generate a unique share token')
  }
}
