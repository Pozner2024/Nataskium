import { describe, expect, it } from 'vitest'

// pg подставил бы PGHOST, PGPORT и др. из оболочки разработчика: vitest.integration.config.ts их убирает
describe('окружение воркера интеграционных тестов', () => {
  it('нет переменных с префиксом PG', () => {
    expect(Object.keys(process.env).filter((name) => name.startsWith('PG'))).toEqual([])
  })

  it('DATABASE_URL указывает на тестовую базу', () => {
    const url = new URL(process.env.DATABASE_URL ?? '')

    expect(url.port).toBe('5433')
    expect(url.pathname.endsWith('_test')).toBe(true)
  })
})
