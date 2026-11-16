import { describe, expect, it } from 'vitest'
import { formatClock } from './formatClock'

describe('formatClock', () => {
  it('секунды дополняются нулём, минуты без ведущего нуля', () => {
    expect(formatClock(5)).toBe('0:05')
    expect(formatClock(65)).toBe('1:05')
    expect(formatClock(600)).toBe('10:00')
    expect(formatClock(222)).toBe('3:42')
  })

  it('максимальный лимит 180 минут', () => {
    expect(formatClock(180 * 60)).toBe('180:00')
  })

  it('ноль и отрицательное значение дают 0:00', () => {
    expect(formatClock(0)).toBe('0:00')
    expect(formatClock(-1)).toBe('0:00')
    expect(formatClock(-3600)).toBe('0:00')
  })

  it('дробные секунды отбрасываются вниз', () => {
    expect(formatClock(59.9)).toBe('0:59')
    expect(formatClock(60.5)).toBe('1:00')
  })
})
