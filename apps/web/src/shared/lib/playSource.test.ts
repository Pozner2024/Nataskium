import { describe, expect, it } from 'vitest'
import { isPlaySourceValid, playApiPath } from './playSource'

const TOKEN = 'abcdefghijklmnopqrstuv'
const MAX_NUMBER = 2_147_483_647

describe('playApiPath', () => {
  it('ссылка учителя — /play/<token>', () => {
    expect(playApiPath({ kind: 'share', token: TOKEN })).toBe(`/play/${TOKEN}`)
  })

  it('библиотека — /library/play/<номер>', () => {
    expect(playApiPath({ kind: 'library', number: 12 })).toBe('/library/play/12')
  })

  it('токен экранируется: обход пути не выходит за /play', () => {
    expect(playApiPath({ kind: 'share', token: '../auth/me' })).toBe('/play/..%2Fauth%2Fme')
  })
})

describe('isPlaySourceValid', () => {
  it('null — не найдено', () => {
    expect(isPlaySourceValid(null)).toBe(false)
  })

  it('ссылка учителя проверяется схемой shareToken', () => {
    expect(isPlaySourceValid({ kind: 'share', token: TOKEN })).toBe(true)
    expect(isPlaySourceValid({ kind: 'share', token: 'short' })).toBe(false)
    expect(isPlaySourceValid({ kind: 'share', token: '../auth/me' })).toBe(false)
  })

  it('номер библиотеки — целое от 1 до максимума', () => {
    expect(isPlaySourceValid({ kind: 'library', number: 1 })).toBe(true)
    expect(isPlaySourceValid({ kind: 'library', number: MAX_NUMBER })).toBe(true)
    for (const number of [0, -1, 12.5, MAX_NUMBER + 1, Number.NaN]) {
      expect(isPlaySourceValid({ kind: 'library', number })).toBe(false)
    }
  })
})
