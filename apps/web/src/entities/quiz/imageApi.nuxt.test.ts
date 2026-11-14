import { IMAGE_UPLOAD_FIELD } from '@nataskium/shared/schemas'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '@/shared'
import { imageApi } from './imageApi'

const IMAGE = { id: '6f1c2a4e-8d3b-4f5a-9c7e-1b2d3e4f5a6b', url: 'https://storage.example.test/quiz-images/6f1c2a4e-8d3b-4f5a-9c7e-1b2d3e4f5a6b.webp' }

type FetchCall = { url: string; init: RequestInit }

function stubFetch(response: () => Response): FetchCall[] {
  const calls: FetchCall[] = []
  vi.stubGlobal('fetch', (url: string, init: RequestInit) => {
    calls.push({ url, init })
    return Promise.resolve(response())
  })
  return calls
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('imageApi.upload', () => {
  it('POST /api/quiz-images: FormData с файлом в поле file, Bearer, без Content-Type', async () => {
    const calls = stubFetch(() => new Response(JSON.stringify({ image: IMAGE }), { status: 201 }))
    const file = new File([new Uint8Array([1, 2, 3])], 'qa.png', { type: 'image/png' })

    await imageApi.upload(file, 'qa-token')

    expect(calls[0]?.url).toBe('/api/quiz-images')
    expect(calls[0]?.init.method).toBe('POST')
    expect(calls[0]?.init.headers).toEqual({ Authorization: 'Bearer qa-token' })
    const body = calls[0]?.init.body
    expect(body).toBeInstanceOf(FormData)
    expect((body as FormData).get(IMAGE_UPLOAD_FIELD)).toBeInstanceOf(File)
  })

  it('возвращает { id, url } картинки', async () => {
    stubFetch(() => new Response(JSON.stringify({ image: IMAGE }), { status: 201 }))

    await expect(imageApi.upload(new File(['x'], 'qa.png', { type: 'image/png' }), 'qa-token')).resolves.toEqual(IMAGE)
  })

  it('503 с Retry-After — ApiError со статусом и retryAfterSeconds', async () => {
    stubFetch(() => new Response(JSON.stringify({ error: 'Busy' }), { status: 503, headers: { 'Retry-After': '5' } }))

    const error = await imageApi.upload(new File(['x'], 'qa.png', { type: 'image/png' }), 'qa-token').catch((caught: unknown) => caught)

    expect(error).toBeInstanceOf(ApiError)
    expect(error).toMatchObject({ status: 503, retryAfterSeconds: 5 })
  })
})
