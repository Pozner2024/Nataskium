import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { PrismaClient } from '../../src/generated/prisma/client'
import { createTestPrisma } from './testDatabase'

let prisma: PrismaClient

beforeAll(async () => {
  prisma = await createTestPrisma()
})

afterAll(async () => {
  await prisma.$disconnect()
})

describe('createPrismaClient', () => {
  it('statement_timeout соединений приложения — 5 с', async () => {
    const rows = await prisma.$queryRaw<{ statement_timeout: string }[]>`SHOW statement_timeout`

    expect(rows[0]?.statement_timeout).toBe('5s')
  })
})
