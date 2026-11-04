import type { Context } from 'hono'
import type { z } from 'zod'
import { ValidationError } from '../errors'

const JSON_CONTENT_TYPE = /^application\/json\s*(;|$)/i

export async function readJsonBody<T extends z.ZodType>(c: Context, schema: T): Promise<z.output<T>> {
  if (!JSON_CONTENT_TYPE.test(c.req.header('content-type') ?? '')) {
    throw new ValidationError([{ path: [], message: 'Content-Type must be application/json' }])
  }

  let body: unknown
  try {
    body = await c.req.json()
  } catch {
    throw new ValidationError([{ path: [], message: 'Body must be valid JSON' }])
  }

  const result = await schema.safeParseAsync(body)
  if (result.success) return result.data

  throw new ValidationError(
    result.error.issues.map((issue) => ({ path: issue.path.map(String), message: issue.message })),
  )
}
