import { randomUUID } from 'node:crypto'
import { IMAGE_UPLOAD_FIELD, MAX_IMAGE_UPLOAD_BYTES } from '@nataskium/shared/schemas'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { makeTokenService } from '../src/features/auth'
import { type QuizImageRepository, makeUploadImage } from '../src/features/quiz-images'
import { AppError } from '../src/shared/errors'
import { MEMORY_IMAGES_BASE_URL, makeMemoryImageStorage } from './fakes/memoryImageStorage'
import { TEST_ENV, TEST_WEB_ORIGIN, createTestApp, fromIp } from './fakes/testApp'
import { HTML, JPEG_MAGIC_WITH_HTML, SVG } from './fixtures/imageFixtures'

const UPLOAD_PATH = '/api/quiz-images'
const MAX_UPLOAD_BODY_BYTES = 16 * 1024 * 1024
const UPLOADS_PER_TEACHER_PER_HOUR = 120
const UPLOADS_PER_IP_PER_HOUR = 300
const MAX_CONCURRENT_UPLOADS = 4
const MAX_CONCURRENT_UPLOADS_PER_TEACHER = 2
const UPLOAD_BODY_READ_TIMEOUT_MS = 120 * 1000
const PROCESSED = new Uint8Array([1, 2, 3])
const tokens = makeTokenService({ jwtSecret: TEST_ENV.JWT_SECRET, hmacSecret: TEST_ENV.HMAC_SECRET })

function makeFakeImages(options: { failCreate?: boolean } = {}) {
  const rows: { id: string; teacherId: string }[] = []
  const repository: QuizImageRepository = {
    async create(id, teacherId) {
      if (options.failCreate === true) throw new Error('db down')
      rows.push({ id, teacherId })
      return { id }
    },
    async findOwned() {
      return []
    },
    async attach() {
      return 0
    },
    async detachMissing() {
      return []
    },
    async deleteRows() {},
    async deleteDetached() {
      return []
    },
    async listOrphans() {
      return []
    },
    async existingIds() {
      return []
    },
    async countAll() {
      return rows.length
    },
  }
  return { repository, rows }
}

describe('uploadImage (use-case)', () => {
  it('обработка → put → строка; адрес — публичный URL ключа quiz-images/<uuid>.webp', async () => {
    const { storage, objects } = makeMemoryImageStorage()
    const images = makeFakeImages()
    const id = randomUUID()
    const upload = makeUploadImage({ images: images.repository, storage, processImage: async () => PROCESSED, generateId: () => id })

    const result = await upload('teacher-1', new Uint8Array([9]))

    expect(result).toEqual({ id, url: `${MEMORY_IMAGES_BASE_URL}/quiz-images/${id}.webp` })
    expect(objects.get(`quiz-images/${id}.webp`)).toEqual({ body: PROCESSED, contentType: 'image/webp' })
    expect(images.rows).toEqual([{ id, teacherId: 'teacher-1' }])
  })

  it('хранилище не настроено → 503, файл не обрабатывается', async () => {
    const processImage = vi.fn(async () => PROCESSED)
    const upload = makeUploadImage({ images: makeFakeImages().repository, storage: null, processImage })

    await expect(upload('t', new Uint8Array([1]))).rejects.toMatchObject({ status: 503 })
    expect(processImage).not.toHaveBeenCalled()
  })

  it('файл больше 15 МБ → 400 до обработки', async () => {
    const processImage = vi.fn(async () => PROCESSED)
    const { storage } = makeMemoryImageStorage()
    const upload = makeUploadImage({ images: makeFakeImages().repository, storage, processImage })

    await expect(upload('t', new Uint8Array(MAX_IMAGE_UPLOAD_BYTES + 1))).rejects.toMatchObject({
      status: 400,
      message: 'File is too large',
    })
    expect(processImage).not.toHaveBeenCalled()
  })

  it('не картинка → ошибка обработки, put не вызван, строки нет', async () => {
    const { storage, calls } = makeMemoryImageStorage()
    const images = makeFakeImages()
    const upload = makeUploadImage({
      images: images.repository,
      storage,
      processImage: async () => {
        throw new AppError(400, 'Unsupported or corrupted image')
      },
    })

    await expect(upload('t', HTML)).rejects.toMatchObject({ status: 400 })
    expect(calls.put).toBe(0)
    expect(images.rows).toEqual([])
  })

  it('сбой хранилища → 503, строки нет, в логе без данных файла', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    const { storage, failing } = makeMemoryImageStorage()
    failing.put = true
    const images = makeFakeImages()
    const upload = makeUploadImage({ images: images.repository, storage, processImage: async () => PROCESSED })

    await expect(upload('t', new Uint8Array([1]))).rejects.toMatchObject({ status: 503, message: 'Image storage is unavailable' })
    expect(images.rows).toEqual([])
    expect(error).toHaveBeenCalledWith('ExternalServiceError', 'memory-storage', null)
    error.mockRestore()
  })

  it('сбой записи строки → файл удаляется из хранилища', async () => {
    const { storage, objects } = makeMemoryImageStorage()
    const upload = makeUploadImage({
      images: makeFakeImages({ failCreate: true }).repository,
      storage,
      processImage: async () => PROCESSED,
    })

    await expect(upload('t', new Uint8Array([1]))).rejects.toThrow('db down')
    expect(objects.size).toBe(0)
  })

  it('учителя уже нет (строка не записана из-за внешнего ключа) → 401 как у requireAuth, файл удалён, в логе пусто', async () => {
    const errorLog = vi.spyOn(console, 'error').mockImplementation(() => {})
    const { storage, objects } = makeMemoryImageStorage()
    const images: QuizImageRepository = { ...makeFakeImages().repository, create: async () => null }
    const upload = makeUploadImage({ images, storage, processImage: async () => PROCESSED })

    const error = await upload('teacher-gone', new Uint8Array([1])).then(() => null, (e: unknown) => e)

    expect(error).toBeInstanceOf(AppError)
    expect(error).toMatchObject({ status: 401, message: 'Unauthorized', headers: { 'WWW-Authenticate': 'Bearer' } })
    expect(objects.size).toBe(0)
    expect(errorLog).not.toHaveBeenCalled()
  })
})

// Сценарии до обращения к базе: unit-база в createTestApp не подключена
describe('POST /api/quiz-images (без базы)', () => {
  let logSpies: ReturnType<typeof vi.spyOn>[]

  beforeEach(() => {
    logSpies = (['log', 'info', 'warn', 'error'] as const).map((method) => vi.spyOn(console, method).mockImplementation(() => {}))
  })
  afterEach(() => {
    vi.restoreAllMocks()
  })

  async function auth(teacherId: string = randomUUID()) {
    return { authorization: `Bearer ${await tokens.signAccessToken(teacherId)}` }
  }

  function form(bytes: Uint8Array, name = 'photo.jpg', type = 'image/jpeg', field = IMAGE_UPLOAD_FIELD) {
    const data = new FormData()
    data.append(field, new File([new Uint8Array(bytes)], name, { type }))
    return data
  }

  function post(app: ReturnType<typeof createTestApp>, headers: Record<string, string>, body: BodyInit, ip?: string) {
    return app.request(UPLOAD_PATH, { method: 'POST', headers: { origin: TEST_WEB_ORIGIN, ...headers }, body }, fromIp(ip))
  }

  it('без токена → 401', async () => {
    const app = createTestApp({ imageStorage: makeMemoryImageStorage().storage })
    expect((await post(app, {}, form(HTML))).status).toBe(401)
  })

  it('хранилище не настроено → 503', async () => {
    const app = createTestApp({ imageStorage: null })
    expect((await post(app, await auth(), form(HTML))).status).toBe(503)
  })

  it('без поля file, с другим полем или с двумя файлами → 400', async () => {
    const app = createTestApp({ imageStorage: makeMemoryImageStorage().storage })
    const two = form(HTML)
    two.append(IMAGE_UPLOAD_FIELD, new File([HTML], 'b.jpg', { type: 'image/jpeg' }))

    for (const body of [new FormData(), form(HTML, 'a.jpg', 'image/jpeg', 'image'), two]) {
      const response = await post(app, await auth(), body)
      expect(response.status).toBe(400)
      expect(await response.json()).toEqual({ error: 'Image file is required' })
    }
  })

  it('не multipart (JSON) → 400', async () => {
    const app = createTestApp({ imageStorage: makeMemoryImageStorage().storage })
    const response = await post(app, { ...(await auth()), 'content-type': 'application/json' }, '{"file":"x"}')
    expect(response.status).toBe(400)
  })

  it.each([
    ['HTML под image/jpeg', HTML],
    ['SVG под image/jpeg', SVG],
    ['сигнатура JPEG + HTML', JPEG_MAGIC_WITH_HTML],
  ])('%s → 400, в хранилище ничего не записано, без лога', async (_name, bytes) => {
    const memory = makeMemoryImageStorage()
    const app = createTestApp({ imageStorage: memory.storage })

    const response = await post(app, await auth(), form(bytes))

    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({ error: 'Unsupported or corrupted image' })
    expect(memory.calls.put).toBe(0)
    expect(logSpies.every((spy) => spy.mock.calls.length === 0)).toBe(true)
  })

  it('файл 15 МБ + 1 байт → 400 «File is too large»', async () => {
    const memory = makeMemoryImageStorage()
    const app = createTestApp({ imageStorage: memory.storage })

    const response = await post(app, await auth(), form(new Uint8Array(MAX_IMAGE_UPLOAD_BYTES + 1)))

    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({ error: 'File is too large' })
    expect(memory.calls.put).toBe(0)
  })

  it('тело больше 16 МБ → 413', async () => {
    const app = createTestApp({ imageStorage: makeMemoryImageStorage().storage })
    const response = await post(app, await auth(), form(new Uint8Array(MAX_UPLOAD_BODY_BYTES)))
    expect(response.status).toBe(413)
  })

  it('121-я загрузка учителя за час → 429 с Retry-After', async () => {
    const app = createTestApp({ imageStorage: makeMemoryImageStorage().storage })
    const headers = await auth()

    for (let i = 0; i < UPLOADS_PER_TEACHER_PER_HOUR; i++) {
      expect((await post(app, headers, form(HTML))).status).toBe(400)
    }
    const limited = await post(app, headers, form(HTML))

    expect(limited.status).toBe(429)
    expect(Number(limited.headers.get('retry-after'))).toBeGreaterThan(0)
    // Лимит — на учителя: другой учитель с того же IP проходит
    expect((await post(app, await auth(), form(HTML))).status).toBe(400)
  })

  it('301-я загрузка с одного IP (разные учителя) → 429, с другого IP — проходит', async () => {
    const app = createTestApp({ imageStorage: makeMemoryImageStorage().storage })
    const teachers = await Promise.all([auth(), auth(), auth()])

    for (let i = 0; i < UPLOADS_PER_IP_PER_HOUR; i++) {
      expect((await post(app, teachers[i % teachers.length]!, form(HTML))).status).toBe(400)
    }

    expect((await post(app, await auth(), form(HTML))).status).toBe(429)
    expect((await post(app, await auth(), form(HTML), '10.0.0.2')).status).toBe(400)
  })

  // Тело, которое не приходит, пока тест не «оборвёт соединение»; pulls — сколько раз его начали читать
  function stalledBody() {
    let abort: () => void = () => {}
    const state = { pulls: 0 }
    const stream = new ReadableStream<Uint8Array>(
      {
        pull(controller) {
          state.pulls++
          return new Promise<void>((resolve) => {
            abort = () => {
              controller.error(new Error('connection reset'))
              resolve()
            }
          })
        },
      },
      { highWaterMark: 0 },
    )
    return { stream, state, abort: () => abort() }
  }

  function postStream(app: ReturnType<typeof createTestApp>, headers: Record<string, string>, stream: ReadableStream<Uint8Array>) {
    return app.request(
      UPLOAD_PATH,
      {
        method: 'POST',
        headers: { origin: TEST_WEB_ORIGIN, 'content-type': 'multipart/form-data; boundary=x', ...headers },
        body: stream,
        duplex: 'half',
      } as RequestInit,
      fromIp(),
    )
  }

  async function occupy(app: ReturnType<typeof createTestApp>, headers: Record<string, string>) {
    const body = stalledBody()
    const response = postStream(app, headers, body.stream)
    // Тело начали читать — слот уже занят
    await vi.waitFor(() => expect(body.state.pulls).toBe(1))
    return { ...body, response }
  }

  it('третья одновременная загрузка учителя → 503 с Retry-After, тело не читается; после обрыва слоты свободны', async () => {
    const app = createTestApp({ imageStorage: makeMemoryImageStorage().storage })
    const headers = await auth()
    const running = []
    for (let i = 0; i < MAX_CONCURRENT_UPLOADS_PER_TEACHER; i++) running.push(await occupy(app, headers))

    const extra = stalledBody()
    const busy = await postStream(app, headers, extra.stream)

    expect(busy.status).toBe(503)
    expect(Number(busy.headers.get('retry-after'))).toBeGreaterThan(0)
    expect(extra.state.pulls).toBe(0)
    // Другой учитель не упирается в лимит этого
    expect((await post(app, await auth(), form(HTML))).status).toBe(400)

    for (const upload of running) upload.abort()
    for (const upload of running) expect((await upload.response).status).toBe(400)
    for (let i = 0; i <= MAX_CONCURRENT_UPLOADS_PER_TEACHER; i++) {
      expect((await post(app, headers, form(HTML))).status).toBe(400)
    }
  })

  it('без токена тело не читается — 401', async () => {
    const app = createTestApp({ imageStorage: makeMemoryImageStorage().storage })
    const body = stalledBody()

    expect((await postStream(app, {}, body.stream)).status).toBe(401)
    expect(body.state.pulls).toBe(0)
  })

  it('пятая одновременная загрузка (разные учителя) → 503 до чтения тела; после ошибок слоты не утекают', async () => {
    const app = createTestApp({ imageStorage: makeMemoryImageStorage().storage })
    const running = []
    for (let i = 0; i < MAX_CONCURRENT_UPLOADS; i++) running.push(await occupy(app, await auth()))

    const extra = stalledBody()
    const busy = await postStream(app, await auth(), extra.stream)

    expect(busy.status).toBe(503)
    expect(extra.state.pulls).toBe(0)

    for (const upload of running) upload.abort()
    await Promise.all(running.map((upload) => upload.response))
    const afterwards = await Promise.all(Array.from({ length: MAX_CONCURRENT_UPLOADS }, async () => post(app, await auth(), form(HTML))))
    expect(afterwards.map((response) => response.status)).toEqual(Array(MAX_CONCURRENT_UPLOADS).fill(400))
  })

  describe('таймаут чтения тела', () => {
    beforeEach(() => {
      vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    })
    afterEach(() => {
      vi.useRealTimers()
    })

    // Как occupy, но без vi.waitFor: тот сдвигает фейковые часы, а здесь важно, сколько времени прошло
    async function occupyWithoutTime(app: ReturnType<typeof createTestApp>, headers: Record<string, string>) {
      const body = stalledBody()
      const response = postStream(app, headers, body.stream)
      while (body.state.pulls === 0) await vi.advanceTimersByTimeAsync(0)
      return { ...body, response }
    }

    it('тело не дочитано за 120 с → 408, слоты учителя свободны', async () => {
      const app = createTestApp({ imageStorage: makeMemoryImageStorage().storage })
      const headers = await auth()
      const running = []
      for (let i = 0; i < MAX_CONCURRENT_UPLOADS_PER_TEACHER; i++) running.push(await occupyWithoutTime(app, headers))
      const settled = { count: 0 }
      for (const upload of running) void Promise.resolve(upload.response).then(() => settled.count++)

      await vi.advanceTimersByTimeAsync(UPLOAD_BODY_READ_TIMEOUT_MS - 1)
      expect(settled.count).toBe(0)
      await vi.advanceTimersByTimeAsync(1)

      for (const upload of running) {
        const response = await upload.response
        expect(response.status).toBe(408)
        expect(await response.json()).toEqual({ error: 'Image upload timed out' })
      }
      // Таймаут — ожидаемый отказ клиента, не ошибка сервера: в логах ничего
      expect(logSpies.every((spy) => spy.mock.calls.length === 0)).toBe(true)
      for (let i = 0; i <= MAX_CONCURRENT_UPLOADS_PER_TEACHER; i++) {
        expect((await post(app, headers, form(HTML))).status).toBe(400)
      }
      // Обрыв недочитанного тела после ответа ничего не ломает
      for (const upload of running) upload.abort()
    })

    it('тело пришло вовремя — таймер снят, ответ по содержимому', async () => {
      const app = createTestApp({ imageStorage: makeMemoryImageStorage().storage })

      const response = await post(app, await auth(), form(HTML))
      await vi.advanceTimersByTimeAsync(UPLOAD_BODY_READ_TIMEOUT_MS)

      expect(response.status).toBe(400)
      expect(vi.getTimerCount()).toBe(0)
    })
  })
})
