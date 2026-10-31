import { describe, expect, it } from 'vitest'
import { createSeededRandom } from './random'

const SEED = 42
const OTHER_SEED = 7
const SEQUENCE_LENGTH = 100

function take(next: () => number, count: number) {
  return Array.from({ length: count }, next)
}

describe('createSeededRandom', () => {
  it('одинаковый seed даёт одинаковую последовательность', () => {
    expect(take(createSeededRandom(SEED), SEQUENCE_LENGTH)).toEqual(take(createSeededRandom(SEED), SEQUENCE_LENGTH))
  })

  it('разные seed дают разные последовательности', () => {
    expect(take(createSeededRandom(SEED), SEQUENCE_LENGTH)).not.toEqual(take(createSeededRandom(OTHER_SEED), SEQUENCE_LENGTH))
  })

  it('числа идут по-разному и остаются в диапазоне от 0 до 1', () => {
    const values = take(createSeededRandom(SEED), SEQUENCE_LENGTH)

    expect(new Set(values).size).toBe(SEQUENCE_LENGTH)
    expect(values.every(value => value > 0 && value < 1)).toBe(true)
  })

  it('генераторы не влияют друг на друга', () => {
    const first = createSeededRandom(SEED)
    const expected = take(createSeededRandom(SEED), 2)

    const second = createSeededRandom(OTHER_SEED)
    const firstValue = first()
    second()

    expect([firstValue, first()]).toEqual(expected)
  })
})
