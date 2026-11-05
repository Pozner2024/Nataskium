import { beforeAll, describe, expect, it } from 'vitest'
import { makePasswordHasher } from '../src/features/auth'
import type { PasswordHasher } from '../src/features/auth'
import { MAX_PENDING_HASH_JOBS } from '../src/features/auth/infrastructure/passwordHasher'
import { ServiceBusyError } from '../src/shared/errors'

const PASSWORD = 'qa-correct-horse-1957'
const ARGON2ID_PREFIX = '$argon2id$v=19$m=19456,t=2,p=1$'
const SERVICE_UNAVAILABLE_STATUS = 503
const RETRY_AFTER_SECONDS = 5
// argon2 с параметрами OWASP медленный: очередь из MAX_PENDING_HASH_JOBS задач идёт в 4 потоках libuv
const QUEUE_TEST_TIMEOUT_MS = 30_000
const TIMING_SAMPLES = 5
// Без сверки с dummy-хэшем verify(null) занял бы микросекунды против десятков миллисекунд у argon2
const MIN_DUMMY_TO_REAL_RATIO = 0.5

let hasher: PasswordHasher
let storedHash: string

beforeAll(async () => {
  hasher = await makePasswordHasher()
  storedHash = await hasher.hash(PASSWORD)
})

async function medianDurationMs(run: () => Promise<unknown>): Promise<number> {
  const durations: number[] = []
  for (let sample = 0; sample < TIMING_SAMPLES; sample++) {
    const start = performance.now()
    await run()
    durations.push(performance.now() - start)
  }
  return durations.sort((a, b) => a - b)[Math.floor(TIMING_SAMPLES / 2)] ?? 0
}

async function rejectionOf(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise
  } catch (error) {
    return error
  }
  throw new Error('expected a rejection')
}

describe('passwordHasher: хэш и сверка', () => {
  it('хэш — argon2id с параметрами OWASP', () => {
    expect(storedHash.startsWith(ARGON2ID_PREFIX)).toBe(true)
  })

  it('хэш не содержит пароль', () => {
    expect(storedHash).not.toContain(PASSWORD)
  })

  it('у одного пароля разные хэши: случайная соль', async () => {
    expect(await hasher.hash(PASSWORD)).not.toBe(storedHash)
  })

  it('верный пароль → true', async () => {
    expect(await hasher.verify(storedHash, PASSWORD)).toBe(true)
  })

  it.each([
    ['другой пароль', 'qa-wrong-password'],
    ['другой регистр', PASSWORD.toUpperCase()],
    ['пробел в конце', `${PASSWORD} `],
    ['пустой', ''],
  ])('неверный пароль → false: %s', async (_name, password) => {
    expect(await hasher.verify(storedHash, password)).toBe(false)
  })

  it('verify(null) → false: сверка с dummy-хэшем', async () => {
    expect(await hasher.verify(null, PASSWORD)).toBe(false)
  })

  // Иначе по времени ответа видно, есть ли учитель с этим email
  it('verify(null) идёт столько же, сколько настоящая сверка', async () => {
    const real = await medianDurationMs(() => hasher.verify(storedHash, 'qa-wrong-password'))
    const dummy = await medianDurationMs(() => hasher.verify(null, 'qa-wrong-password'))

    expect(dummy / real).toBeGreaterThan(MIN_DUMMY_TO_REAL_RATIO)
  })

  it.each([
    ['пустая строка', ''],
    ['не хэш', 'plain-password'],
    ['обрезанный argon2id', ARGON2ID_PREFIX],
    ['bcrypt', '$2b$12$abcdefghijklmnopqrstuuJ5gKxVQ6lY1o3l0zP1oQ8X8yJ0eYyF2'],
    ['испорченная соль', `${ARGON2ID_PREFIX}!!!$!!!`],
  ])('битый хэш → false без исключения: %s', async (_name, broken) => {
    expect(await hasher.verify(broken, PASSWORD)).toBe(false)
  })
})

describe('passwordHasher: очередь', () => {
  it(
    `при ${MAX_PENDING_HASH_JOBS} задачах в работе — ServiceBusyError, после завершения — снова свободно`,
    async () => {
      expect(hasher.hasCapacity()).toBe(true)
      const running = Array.from({ length: MAX_PENDING_HASH_JOBS }, () => hasher.hash(PASSWORD))

      expect(hasher.hasCapacity()).toBe(false)
      const busy = await rejectionOf(hasher.hash(PASSWORD))
      await Promise.all(running)

      expect(busy).toBeInstanceOf(ServiceBusyError)
      expect(busy).toMatchObject({ status: SERVICE_UNAVAILABLE_STATUS, retryAfterSeconds: RETRY_AFTER_SECONDS })
      expect(hasher.hasCapacity()).toBe(true)
    },
    QUEUE_TEST_TIMEOUT_MS,
  )

  // Иначе по 503 можно было бы понять, есть ли учитель с этим email
  it(
    'сверки с dummy-хэшем тоже занимают очередь',
    async () => {
      const running = Array.from({ length: MAX_PENDING_HASH_JOBS }, () => hasher.verify(null, PASSWORD))

      expect(hasher.hasCapacity()).toBe(false)
      const busy = await rejectionOf(hasher.verify(storedHash, PASSWORD))
      await Promise.all(running)

      expect(busy).toBeInstanceOf(ServiceBusyError)
      expect(hasher.hasCapacity()).toBe(true)
    },
    QUEUE_TEST_TIMEOUT_MS,
  )

  it(
    'сверки с битым хэшем освобождают место в очереди',
    async () => {
      await Promise.all(Array.from({ length: MAX_PENDING_HASH_JOBS }, () => hasher.verify('plain-password', PASSWORD)))

      expect(hasher.hasCapacity()).toBe(true)
    },
    QUEUE_TEST_TIMEOUT_MS,
  )

  it(
    'отказ ServiceBusyError не занимает место в очереди',
    async () => {
      const running = Array.from({ length: MAX_PENDING_HASH_JOBS }, () => hasher.hash(PASSWORD))
      const refusals = await Promise.all(Array.from({ length: 5 }, () => rejectionOf(hasher.hash(PASSWORD))))
      await Promise.all(running)

      expect(refusals.every((error) => error instanceof ServiceBusyError)).toBe(true)
      expect(hasher.hasCapacity()).toBe(true)
      expect(await hasher.verify(storedHash, PASSWORD)).toBe(true)
    },
    QUEUE_TEST_TIMEOUT_MS,
  )

  it(`ровно ${MAX_PENDING_HASH_JOBS - 1} задачи в работе — ещё одна принимается`, async () => {
    const running = Array.from({ length: MAX_PENDING_HASH_JOBS - 1 }, () => hasher.verify(null, PASSWORD))

    expect(hasher.hasCapacity()).toBe(true)
    const last = hasher.verify(storedHash, PASSWORD)
    expect(hasher.hasCapacity()).toBe(false)

    await Promise.all(running)
    expect(await last).toBe(true)
  }, QUEUE_TEST_TIMEOUT_MS)
})
