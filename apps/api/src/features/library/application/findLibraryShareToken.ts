import type { LibraryRepository } from '../types'
import { libraryPlayNotFound } from './libraryErrors'

type FindLibraryShareTokenDeps = { library: LibraryRepository }

// Номер опубликованного задания → его shareToken для use-cases игры. Только здесь проверяется публичность:
// игра сама отбрасывает лишь удалённые задания (ADR-0019)
export function makeFindLibraryShareToken(deps: FindLibraryShareTokenDeps) {
  return async function findLibraryShareToken(number: number): Promise<string> {
    const shareToken = await deps.library.findPlayableShareToken(number)
    if (shareToken === null) throw libraryPlayNotFound()
    return shareToken
  }
}
