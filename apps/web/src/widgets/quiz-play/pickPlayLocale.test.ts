import { describe, expect, it } from 'vitest'
import { pickPlayLocale } from './pickPlayLocale'

describe('pickPlayLocale', () => {
  it('берёт основной подтег первого поддерживаемого языка', () => {
    expect(pickPlayLocale(['de-AT', 'en'])).toBe('de')
  })

  it('пропускает неподдерживаемые языки', () => {
    expect(pickPlayLocale(['zh-CN', 'fr-CA'])).toBe('fr')
  })

  it('без поддерживаемых языков — английский', () => {
    expect(pickPlayLocale(['zh-CN'])).toBe('en')
  })

  it('пустой список — английский', () => {
    expect(pickPlayLocale([])).toBe('en')
  })

  it('регистр не важен', () => {
    expect(pickPlayLocale(['RU-ru'])).toBe('ru')
  })
})
