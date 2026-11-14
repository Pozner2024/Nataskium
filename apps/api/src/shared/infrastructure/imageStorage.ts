import { DeleteObjectsCommand, ListObjectsV2Command, PutObjectCommand, S3Client } from '@aws-sdk/client-s3'
import { NodeHttpHandler } from '@smithy/node-http-handler'
import type { Env } from '../config'
import { ExternalServiceError } from '../errors'

export type ImageContentType = 'image/webp'

// lastModified — null, если S3 не вернул дату
export type StoredObject = { key: string; lastModified: Date | null }

// Порт хранилища картинок викторин. Сбой хранилища — ExternalServiceError (→ 503)
export type ImageStorage = {
  put(key: string, body: Uint8Array, contentType: ImageContentType): Promise<void>
  remove(keys: readonly string[]): Promise<void>
  // С датой изменения: сверка не трогает свежие файлы, к которым ещё пишется строка
  listObjects(prefix: string): Promise<StoredObject[]>
  publicUrl(key: string): string
}

export type S3ImageStorageConfig = {
  endpoint: string
  bucket: string
  accessKeyId: string
  secretAccessKey: string
  // Без завершающего '/': адрес картинки — `${publicBaseUrl}/${key}`
  publicBaseUrl: string
}

// Ключ строит только сервер (randomUUID); проверка не даёт ошибке в коде записать или удалить чужой объект
const IMAGE_KEY_PATTERN = /^quiz-images\/[0-9a-f-]{36}\.webp$/
const INVALID_IMAGE_KEY_MESSAGE = 'Invalid image key'
const S3_SERVICE = 'yandex-s3'
// Яндекс Object Storage принимает только этот регион
const S3_REGION = 'ru-central1'
const S3_CONNECTION_TIMEOUT_MS = 3000
const S3_REQUEST_TIMEOUT_MS = 10000
const S3_MAX_ATTEMPTS = 3
// Предел S3 на один запрос DeleteObjects
const S3_DELETE_BATCH_SIZE = 1000
// Имя объекта уникально и не меняется: кэшировать можно навсегда
const IMAGE_CACHE_CONTROL = 'public, max-age=31536000, immutable'

export function assertImageKey(key: string): void {
  if (!IMAGE_KEY_PATTERN.test(key)) throw new Error(INVALID_IMAGE_KEY_MESSAGE)
}

// В ошибку — только HTTP-статус: сообщение и тело ответа S3 могут содержать ключи, бакет и адреса
function httpStatusOf(error: unknown): number | null {
  if (typeof error !== 'object' || error === null || !('$metadata' in error)) return null
  const metadata = error.$metadata
  if (typeof metadata !== 'object' || metadata === null || !('httpStatusCode' in metadata)) return null
  return typeof metadata.httpStatusCode === 'number' ? metadata.httpStatusCode : null
}

function storageError(error: unknown): ExternalServiceError {
  return new ExternalServiceError(S3_SERVICE, httpStatusOf(error))
}

async function withStorageErrors<T>(operation: () => Promise<T>): Promise<T> {
  try {
    return await operation()
  } catch (error) {
    throw storageError(error)
  }
}

function createS3Client(config: S3ImageStorageConfig): S3Client {
  return new S3Client({
    endpoint: config.endpoint,
    region: S3_REGION,
    credentials: { accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey },
    forcePathStyle: true,
    maxAttempts: S3_MAX_ATTEMPTS,
    requestHandler: new NodeHttpHandler({
      connectionTimeout: S3_CONNECTION_TIMEOUT_MS,
      requestTimeout: S3_REQUEST_TIMEOUT_MS,
    }),
  })
}

// client — параметром для тестов: в них send подменяется, запросов в сеть нет.
// ACL не задаётся: бакет открыт на чтение объектов политикой бакета, запись — только сервисным аккаунтом
export function makeS3ImageStorage(config: S3ImageStorageConfig, client: S3Client = createS3Client(config)): ImageStorage {
  const { bucket, publicBaseUrl } = config

  async function removeBatch(keys: readonly string[]): Promise<void> {
    const result = await client.send(
      new DeleteObjectsCommand({ Bucket: bucket, Delete: { Objects: keys.map((Key) => ({ Key })), Quiet: true } }),
    )
    // В тихом режиме S3 отвечает 200 и перечисляет в Errors только неудалённые объекты
    if ((result.Errors?.length ?? 0) > 0) throw new ExternalServiceError(S3_SERVICE, null)
  }

  async function listObjects(prefix: string): Promise<StoredObject[]> {
    return withStorageErrors(async () => {
      const objects: StoredObject[] = []
      let continuationToken: string | undefined
      do {
        const page = await client.send(new ListObjectsV2Command({ Bucket: bucket, Prefix: prefix, ContinuationToken: continuationToken }))
        for (const object of page.Contents ?? []) {
          if (object.Key !== undefined) objects.push({ key: object.Key, lastModified: object.LastModified ?? null })
        }
        continuationToken = page.IsTruncated === true ? page.NextContinuationToken : undefined
      } while (continuationToken !== undefined)
      return objects
    })
  }

  return {
    async put(key, body, contentType) {
      assertImageKey(key)
      await withStorageErrors(() =>
        client.send(
          new PutObjectCommand({ Bucket: bucket, Key: key, Body: body, ContentType: contentType, CacheControl: IMAGE_CACHE_CONTROL }),
        ),
      )
    },

    async remove(keys) {
      keys.forEach(assertImageKey)
      if (keys.length === 0) return
      await withStorageErrors(async () => {
        for (let start = 0; start < keys.length; start += S3_DELETE_BATCH_SIZE) {
          await removeBatch(keys.slice(start, start + S3_DELETE_BATCH_SIZE))
        }
      })
    },

    listObjects,

    publicUrl(key) {
      assertImageKey(key)
      return `${publicBaseUrl}/${key}`
    },
  }
}

type ImageStorageEnv = Partial<
  Pick<Env, 'YANDEX_S3_ENDPOINT' | 'YANDEX_S3_BUCKET' | 'YANDEX_S3_ACCESS_KEY' | 'YANDEX_S3_SECRET_KEY' | 'IMAGES_PUBLIC_BASE_URL'>
>

// В production env.ts требует все переменные хранилища; вне production без них — null (загрузка отвечает 503)
export function createImageStorage(env: ImageStorageEnv): ImageStorage | null {
  const { YANDEX_S3_ENDPOINT, YANDEX_S3_BUCKET, YANDEX_S3_ACCESS_KEY, YANDEX_S3_SECRET_KEY, IMAGES_PUBLIC_BASE_URL } = env
  if (YANDEX_S3_ENDPOINT === undefined || YANDEX_S3_BUCKET === undefined || IMAGES_PUBLIC_BASE_URL === undefined) return null
  if (YANDEX_S3_ACCESS_KEY === undefined || YANDEX_S3_SECRET_KEY === undefined) return null
  return makeS3ImageStorage({
    endpoint: YANDEX_S3_ENDPOINT,
    bucket: YANDEX_S3_BUCKET,
    accessKeyId: YANDEX_S3_ACCESS_KEY,
    secretAccessKey: YANDEX_S3_SECRET_KEY,
    publicBaseUrl: IMAGES_PUBLIC_BASE_URL,
  })
}
