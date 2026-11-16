import { describe, expect, it } from 'vitest'
import { parseQuizSlug } from '../library'
import { MAX_LIBRARY_NUMBER, libraryNumberSchema } from './library'

describe('граница номера библиотеки (INT4)', () => {
  it('libraryNumberSchema: 2147483647 проходит, 2147483648 нет', () => {
    expect(libraryNumberSchema.safeParse('2147483647').success).toBe(true)
    expect(libraryNumberSchema.safeParse('2147483648').success).toBe(false)
    expect(libraryNumberSchema.safeParse('3000000000').success).toBe(false)
  })

  it('parseQuizSlug согласован с границей', () => {
    expect(parseQuizSlug(`${MAX_LIBRARY_NUMBER}-a`)?.number).toBe(MAX_LIBRARY_NUMBER)
    expect(parseQuizSlug('2147483648-a')).toBeNull()
  })
})
