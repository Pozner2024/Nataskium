import { createServer, type AddressInfo, type Server, type Socket } from 'node:net'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createPrismaClient } from '../src/shared/infrastructure'

// Время, за которое клиент успел бы открыть соединение, если бы подключался при создании
const CONNECT_WINDOW_MS = 200
const CLIENT_METHODS = ['$connect', '$disconnect', '$queryRaw', '$transaction'] as const

let server: Server
let connections: Socket[]
let databaseUrl: string

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

// Сервер-счётчик вместо PostgreSQL: проверяет, открывает ли клиент TCP-соединение
beforeEach(async () => {
  connections = []
  server = createServer((socket) => {
    connections.push(socket)
    socket.destroy()
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const { port } = server.address() as AddressInfo
  databaseUrl = `postgresql://qa_user:qa-fake-password@127.0.0.1:${port}/qa_db`
})

afterEach(async () => {
  await new Promise((resolve) => server.close(resolve))
})

describe('createPrismaClient', () => {
  it('возвращает клиент Prisma', async () => {
    const client = createPrismaClient(databaseUrl)

    // Конструктор Prisma 7 возвращает Proxy, instanceof для него ложен: проверяем по методам клиента
    for (const method of CLIENT_METHODS) {
      expect(typeof client[method]).toBe('function')
    }
    await client.$disconnect()
  })

  it('не подключается к базе при создании', async () => {
    const client = createPrismaClient(databaseUrl)
    await wait(CONNECT_WINDOW_MS)

    expect(connections).toHaveLength(0)
    await client.$disconnect()
  })

  it('подключается по переданному адресу при первом запросе', async () => {
    const client = createPrismaClient(databaseUrl)

    await expect(client.$queryRawUnsafe('select 1')).rejects.toThrow()

    expect(connections.length).toBeGreaterThan(0)
    await client.$disconnect()
  })
})
