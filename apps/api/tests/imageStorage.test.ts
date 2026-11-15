import { DeleteObjectsCommand, ListObjectsV2Command, PutObjectCommand, S3Client } from '@aws-sdk/client-s3'
import { describe, expect, it, vi } from 'vitest'
import { ExternalServiceError } from '../src/shared/errors'
import { type S3ImageStorageConfig, createImageStorage, makeS3ImageStorage } from '../src/shared/infrastructure'
import { makeMemoryImageStorage } from './fakes/memoryImageStorage'

// Выдуманные ключи и адреса: запросов в настоящий S3 нет, send подменяется
const CONFIG: S3ImageStorageConfig = {
  endpoint: 'https://storage.example.test',
  bucket: 'qa-bucket',
  accessKeyId: 'qa-fake-access-key',
  secretAccessKey: 'qa-fake-secret-key',
  publicBaseUrl: 'https://storage.example.test/qa-bucket',
}
const KEY_A = 'quiz-images/0b5f1c2e-6c1a-4f5e-9d3a-1a2b3c4d5e6f.webp'
const KEY_B = 'quiz-images/1c6a2d3f-7d2b-4a6f-8e4b-2b3c4d5e6f70.webp'
const BODY = new Uint8Array([1, 2, 3])
const S3_DELETE_BATCH_SIZE = 1000
const SERVICE_UNAVAILABLE = 503

const INVALID_KEYS = [
  '',
  'quiz-images/',
  'quiz-images/../secret.webp',
  'other/0b5f1c2e-6c1a-4f5e-9d3a-1a2b3c4d5e6f.webp',
  'quiz-images/0b5f1c2e-6c1a-4f5e-9d3a-1a2b3c4d5e6f.png',
  'quiz-images/0B5F1C2E-6C1A-4F5E-9D3A-1A2B3C4D5E6F.webp',
  `${KEY_A}\n`,
  `/${KEY_A}`,
]

type SendMock = ReturnType<typeof vi.fn>

function setup(respond: (command: unknown) => unknown = () => ({})) {
  const client = new S3Client({ region: 'ru-central1', credentials: { accessKeyId: 'x', secretAccessKey: 'y' } })
  const send: SendMock = vi.fn(async (command: unknown) => respond(command))
  // Подмена транспорта: без неё SDK пошёл бы в сеть
  Object.defineProperty(client, 'send', { value: send })
  return { storage: makeS3ImageStorage(CONFIG, client), send }
}

function keyOf(index: number): string {
  return `quiz-images/00000000-0000-4000-8000-${String(index).padStart(12, '0')}.webp`
}

describe('makeS3ImageStorage: put', () => {
  it('кладёт объект с типом, кэшем и без ACL', async () => {
    const { storage, send } = setup()

    await storage.put(KEY_A, BODY, 'image/webp')

    expect(send).toHaveBeenCalledTimes(1)
    const command = send.mock.calls[0]?.[0]
    expect(command).toBeInstanceOf(PutObjectCommand)
    expect((command as PutObjectCommand).input).toEqual({
      Bucket: CONFIG.bucket,
      Key: KEY_A,
      Body: BODY,
      ContentType: 'image/webp',
      CacheControl: 'public, max-age=31536000, immutable',
    })
  })

  it.each(INVALID_KEYS)('неверный ключ %j — ошибка до сети', async (key) => {
    const { storage, send } = setup()

    await expect(storage.put(key, BODY, 'image/webp')).rejects.toThrow('Invalid image key')
    expect(send).not.toHaveBeenCalled()
  })

  it('сбой S3 — ExternalServiceError без ключей и тела ответа', async () => {
    const { storage } = setup(() => {
      throw Object.assign(new Error(`AccessDenied ${CONFIG.secretAccessKey}`), { $metadata: { httpStatusCode: 403 } })
    })

    const error = await storage.put(KEY_A, BODY, 'image/webp').catch((caught: unknown) => caught)

    expect(error).toBeInstanceOf(ExternalServiceError)
    expect((error as ExternalServiceError).status).toBe(403)
    expect((error as Error).message).not.toContain(CONFIG.secretAccessKey)
    expect((error as Error).cause).toBeUndefined()
  })

  it('сетевой сбой без HTTP-статуса — ExternalServiceError со status null', async () => {
    const { storage } = setup(() => {
      throw new Error('ECONNRESET')
    })

    const error = await storage.put(KEY_A, BODY, 'image/webp').catch((caught: unknown) => caught)

    expect(error).toBeInstanceOf(ExternalServiceError)
    expect((error as ExternalServiceError).status).toBeNull()
  })
})

describe('makeS3ImageStorage: remove', () => {
  it('пустой список — без запроса', async () => {
    const { storage, send } = setup()

    await storage.remove([])

    expect(send).not.toHaveBeenCalled()
  })

  it('удаляет одним запросом в тихом режиме', async () => {
    const { storage, send } = setup()

    await storage.remove([KEY_A, KEY_B])

    const command = send.mock.calls[0]?.[0]
    expect(command).toBeInstanceOf(DeleteObjectsCommand)
    expect((command as DeleteObjectsCommand).input).toEqual({
      Bucket: CONFIG.bucket,
      Delete: { Objects: [{ Key: KEY_A }, { Key: KEY_B }], Quiet: true },
    })
  })

  it(`больше ${S3_DELETE_BATCH_SIZE} ключей — батчами`, async () => {
    const { storage, send } = setup()
    const keys = Array.from({ length: S3_DELETE_BATCH_SIZE * 2 + 1 }, (_, index) => keyOf(index))

    await storage.remove(keys)

    const sizes = send.mock.calls.map(([command]) => (command as DeleteObjectsCommand).input.Delete?.Objects?.length)
    expect(sizes).toEqual([S3_DELETE_BATCH_SIZE, S3_DELETE_BATCH_SIZE, 1])
  })

  it('неверный ключ среди верных — ошибка до сети', async () => {
    const { storage, send } = setup()

    await expect(storage.remove([KEY_A, 'quiz-images/../x.webp'])).rejects.toThrow('Invalid image key')
    expect(send).not.toHaveBeenCalled()
  })

  it('S3 не удалил часть объектов — ExternalServiceError', async () => {
    const { storage } = setup(() => ({ Errors: [{ Key: KEY_A, Code: 'AccessDenied' }] }))

    await expect(storage.remove([KEY_A])).rejects.toBeInstanceOf(ExternalServiceError)
  })

  it('сбой S3 — ExternalServiceError', async () => {
    const { storage } = setup(() => {
      throw new Error('timeout')
    })

    await expect(storage.remove([KEY_A])).rejects.toBeInstanceOf(ExternalServiceError)
  })
})

describe('makeS3ImageStorage: listObjects', () => {
  it('собирает ключи со всех страниц', async () => {
    const { storage, send } = setup((command) => {
      const token = (command as ListObjectsV2Command).input.ContinuationToken
      if (token === undefined) return { Contents: [{ Key: KEY_A }, {}], IsTruncated: true, NextContinuationToken: 'page-2' }
      return { Contents: [{ Key: KEY_B }], IsTruncated: false }
    })

    expect((await storage.listObjects('quiz-images/')).map((object) => object.key)).toEqual([KEY_A, KEY_B])

    const inputs = send.mock.calls.map(([command]) => (command as ListObjectsV2Command).input)
    expect(inputs).toEqual([
      { Bucket: CONFIG.bucket, Prefix: 'quiz-images/', ContinuationToken: undefined },
      { Bucket: CONFIG.bucket, Prefix: 'quiz-images/', ContinuationToken: 'page-2' },
    ])
  })

  it('пустой бакет — пустой список', async () => {
    const { storage } = setup(() => ({ IsTruncated: false }))

    expect(await storage.listObjects('quiz-images/')).toEqual([])
  })

  it('сбой S3 — ExternalServiceError', async () => {
    const { storage } = setup(() => {
      throw Object.assign(new Error('slow down'), { $metadata: { httpStatusCode: SERVICE_UNAVAILABLE } })
    })

    const error = await storage.listObjects('quiz-images/').catch((caught: unknown) => caught)

    expect(error).toBeInstanceOf(ExternalServiceError)
    expect((error as ExternalServiceError).status).toBe(SERVICE_UNAVAILABLE)
  })
})

describe('makeS3ImageStorage: publicUrl', () => {
  it('базовый адрес + ключ', () => {
    const { storage } = setup()

    expect(storage.publicUrl(KEY_A)).toBe(`${CONFIG.publicBaseUrl}/${KEY_A}`)
  })

  it.each(INVALID_KEYS)('неверный ключ %j — ошибка', (key) => {
    const { storage } = setup()

    expect(() => storage.publicUrl(key)).toThrow('Invalid image key')
  })
})

describe('makeS3ImageStorage: клиент по умолчанию', () => {
  it('создаётся из конфига без запросов в сеть', () => {
    const storage = makeS3ImageStorage(CONFIG)

    expect(storage.publicUrl(KEY_A)).toBe(`${CONFIG.publicBaseUrl}/${KEY_A}`)
  })
})

describe('createImageStorage', () => {
  it('без настроек хранилища (вне production) — null', () => {
    expect(createImageStorage({})).toBeNull()
  })

  it('с настройками — S3-хранилище с публичным адресом из env', () => {
    const storage = createImageStorage({
      YANDEX_S3_ENDPOINT: CONFIG.endpoint,
      YANDEX_S3_BUCKET: CONFIG.bucket,
      YANDEX_S3_ACCESS_KEY: CONFIG.accessKeyId,
      YANDEX_S3_SECRET_KEY: CONFIG.secretAccessKey,
      IMAGES_PUBLIC_BASE_URL: CONFIG.publicBaseUrl,
    })

    expect(storage?.publicUrl(KEY_A)).toBe(`${CONFIG.publicBaseUrl}/${KEY_A}`)
  })
})

describe('makeMemoryImageStorage', () => {
  it('хранит, листает по префиксу и удаляет', async () => {
    const { storage, objects } = makeMemoryImageStorage()

    await storage.put(KEY_A, BODY, 'image/webp')
    await storage.put(KEY_B, BODY, 'image/webp')

    expect(objects.get(KEY_A)).toEqual({ body: BODY, contentType: 'image/webp' })
    const keysOf = async (prefix: string) => (await storage.listObjects(prefix)).map((object) => object.key)
    expect((await keysOf('quiz-images/')).sort()).toEqual([KEY_A, KEY_B].sort())
    expect(await keysOf('other/')).toEqual([])

    await storage.remove([KEY_A])

    expect(await keysOf('quiz-images/')).toEqual([KEY_B])
  })

  it('неверный ключ отклоняется как в S3-реализации', async () => {
    const { storage, objects } = makeMemoryImageStorage()

    await expect(storage.put('quiz-images/../x.webp', BODY, 'image/webp')).rejects.toThrow('Invalid image key')
    expect(objects.size).toBe(0)
  })

  it('publicUrl — базовый адрес + ключ', () => {
    const { storage } = makeMemoryImageStorage('https://images.example.test')

    expect(storage.publicUrl(KEY_A)).toBe(`https://images.example.test/${KEY_A}`)
  })
})

describe('makeS3ImageStorage: listObjects — даты изменения', () => {
  it('собирает ключи и даты изменения со всех страниц; без даты — null, без ключа — пропуск', async () => {
    const modified = new Date('2026-11-13T10:00:00Z')
    const { storage, send } = setup((command) => {
      const token = (command as ListObjectsV2Command).input.ContinuationToken
      if (token === undefined) {
        return { Contents: [{ Key: KEY_A, LastModified: modified }, { LastModified: modified }], IsTruncated: true, NextContinuationToken: 'page-2' }
      }
      return { Contents: [{ Key: KEY_B }], IsTruncated: false }
    })

    expect(await storage.listObjects('quiz-images/')).toEqual([
      { key: KEY_A, lastModified: modified },
      { key: KEY_B, lastModified: null },
    ])
    expect(send).toHaveBeenCalledTimes(2)
  })
})

describe('makeMemoryImageStorage: listObjects', () => {
  it('дата изменения — момент put, её можно сдвинуть через modifiedAt; remove убирает и дату', async () => {
    const { storage, modifiedAt } = makeMemoryImageStorage()
    const past = new Date('2026-11-01T00:00:00Z')

    await storage.put(KEY_A, BODY, 'image/webp')
    await storage.put(KEY_B, BODY, 'image/webp')
    modifiedAt.set(KEY_B, past)

    const listed = await storage.listObjects('quiz-images/')
    expect(listed.find((object) => object.key === KEY_B)?.lastModified).toEqual(past)
    expect(listed.find((object) => object.key === KEY_A)?.lastModified).toBeInstanceOf(Date)
    expect(await storage.listObjects('other/')).toEqual([])

    await storage.remove([KEY_B])

    expect(modifiedAt.has(KEY_B)).toBe(false)
  })
})
