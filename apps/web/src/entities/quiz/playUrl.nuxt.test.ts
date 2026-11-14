import { describe, expect, it } from 'vitest'
import { playUrl } from './playUrl'

describe('playUrl', () => {
  it('собирает адрес игры из origin и токена', () => {
    expect(playUrl('abcdefghijklmnopqrstuv')).toBe(`${window.location.origin}/play/abcdefghijklmnopqrstuv`)
  })
})
