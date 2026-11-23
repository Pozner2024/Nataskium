import { afterEach, describe, expect, it, vi } from 'vitest'
import { PRODUCTION_LIMITS, makeAuthLimiters } from '../src/features/auth'

const REGISTRATION_TOTAL_PER_HOUR = 20
const RESET_TOTAL_PER_HOUR = 10

function address(index: number): string {
  return `qa-${index}@example.test`
}

function consumeDistinct(quota: { tryConsume(email: string): boolean }, count: number, offset = 0): boolean[] {
  return Array.from({ length: count }, (_, index) => quota.tryConsume(address(offset + index)))
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('общий потолок писем', () => {
  it(`регистрация: ${REGISTRATION_TOTAL_PER_HOUR} писем на разные адреса за час, следующее не уходит`, () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const { registrationEmailQuota } = makeAuthLimiters(PRODUCTION_LIMITS)

    expect(consumeDistinct(registrationEmailQuota, REGISTRATION_TOTAL_PER_HOUR).every(Boolean)).toBe(true)
    expect(registrationEmailQuota.tryConsume(address(REGISTRATION_TOTAL_PER_HOUR))).toBe(false)
  })

  it('флуд регистраций не трогает бюджет сброса', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const { registrationEmailQuota, resetEmailQuota } = makeAuthLimiters(PRODUCTION_LIMITS)
    consumeDistinct(registrationEmailQuota, REGISTRATION_TOTAL_PER_HOUR + 5)

    expect(consumeDistinct(resetEmailQuota, RESET_TOTAL_PER_HOUR).every(Boolean)).toBe(true)
    expect(resetEmailQuota.tryConsume(address(RESET_TOTAL_PER_HOUR))).toBe(false)
  })

  it('отказ по лимиту адреса не тратит общий бюджет', () => {
    const { registrationEmailQuota } = makeAuthLimiters(PRODUCTION_LIMITS)
    for (let attempt = 0; attempt < 10; attempt++) registrationEmailQuota.tryConsume(address(0))

    expect(consumeDistinct(registrationEmailQuota, REGISTRATION_TOTAL_PER_HOUR - 3, 1).every(Boolean)).toBe(true)
  })

  it('исчерпание общего бюджета — одно предупреждение без адресов', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const { registrationEmailQuota } = makeAuthLimiters(PRODUCTION_LIMITS)
    consumeDistinct(registrationEmailQuota, REGISTRATION_TOTAL_PER_HOUR + 5)

    expect(warn).toHaveBeenCalledTimes(1)
    expect(warn).toHaveBeenCalledWith('Email budget exhausted', { quota: 'registration' })
  })
})
