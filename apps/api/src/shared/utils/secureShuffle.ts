import { randomInt } from 'node:crypto'

// Fisher–Yates на CSPRNG: порядок слов сопоставления не должен угадываться и выдавать связь пар (ADR-0013)
export function secureShuffle<T>(items: readonly T[]): T[] {
  const result = [...items]
  for (let i = result.length - 1; i > 0; i--) {
    const j = randomInt(i + 1)
    const item = result[i]!
    result[i] = result[j]!
    result[j] = item
  }
  return result
}
