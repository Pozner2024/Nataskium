import { describe, expect, it } from 'vitest'
import {
  apiErrorResponseSchema,
  authSessionResponseSchema,
  meResponseSchema,
  messageResponseSchema,
  teacherViewSchema,
} from './index'

const TEACHER = {
  id: '6f1c2a4e-8d3b-4f5a-9c7e-1b2d3e4f5a6b',
  email: 'qa-anna@example.test',
  displayName: 'Анна',
  hasPassword: true,
  hasGoogle: false,
}
const ACCESS_TOKEN = 'eyJhbGciOiJIUzI1NiIsInR5cCI6ImF0K2p3dCJ9.qa.qa'

describe('teacherViewSchema', () => {
  it('принимает учителя и возвращает те же поля', () => {
    expect(teacherViewSchema.parse(TEACHER)).toEqual(TEACHER)
  })

  it('displayName может быть null', () => {
    expect(teacherViewSchema.parse({ ...TEACHER, displayName: null }).displayName).toBeNull()
  })

  // Если API по ошибке отдаст лишнее, во фронтенд (и в Pinia) оно не попадёт
  it.each([
    ['passwordHash', { passwordHash: '$argon2id$v=19$m=19456,t=2,p=1$c2FsdA$aGFzaA' }],
    ['googleId', { googleId: 'google-sub-anna' }],
    ['emailVerifiedAt', { emailVerifiedAt: '2026-11-06T12:00:00Z' }],
    ['refreshToken', { refreshToken: 'qa-raw-refresh-token' }],
  ])('лишнее поле %s отбрасывается', (_name, extra) => {
    const parsed = teacherViewSchema.parse({ ...TEACHER, ...extra })

    expect(parsed).toEqual(TEACHER)
    expect(Object.keys(parsed).sort()).toEqual(['displayName', 'email', 'hasGoogle', 'hasPassword', 'id'])
  })

  it.each([
    ['id не UUID', { id: 'teacher-1' }],
    ['нет email', { email: undefined }],
    ['displayName отсутствует', { displayName: undefined }],
    ['hasPassword строкой', { hasPassword: 'true' }],
    ['hasGoogle числом', { hasGoogle: 1 }],
  ])('отклоняет: %s', (_name, override) => {
    expect(teacherViewSchema.safeParse({ ...TEACHER, ...override }).success).toBe(false)
  })
})

describe('authSessionResponseSchema: ответ login, verify-email, refresh, google/link', () => {
  it('accessToken и teacher', () => {
    expect(authSessionResponseSchema.parse({ accessToken: ACCESS_TOKEN, teacher: TEACHER })).toEqual({ accessToken: ACCESS_TOKEN, teacher: TEACHER })
  })

  it('refresh-токен в теле, если появится, отбрасывается: ему место только в httpOnly cookie', () => {
    const parsed = authSessionResponseSchema.parse({ accessToken: ACCESS_TOKEN, teacher: TEACHER, refreshToken: 'qa-raw-refresh' })

    expect(Object.keys(parsed).sort()).toEqual(['accessToken', 'teacher'])
  })

  it('лишние поля учителя внутри сессии тоже отбрасываются', () => {
    const parsed = authSessionResponseSchema.parse({ accessToken: ACCESS_TOKEN, teacher: { ...TEACHER, passwordHash: '$argon2id$x' } })

    expect(parsed.teacher).toEqual(TEACHER)
  })

  it.each([
    ['пустой accessToken', { accessToken: '', teacher: TEACHER }],
    ['нет accessToken', { teacher: TEACHER }],
    ['нет teacher', { accessToken: ACCESS_TOKEN }],
    ['teacher без id', { accessToken: ACCESS_TOKEN, teacher: { ...TEACHER, id: undefined } }],
    ['тело ошибки вместо сессии', { error: 'Wrong email or password' }],
  ])('отклоняет: %s', (_name, body) => {
    expect(authSessionResponseSchema.safeParse(body).success).toBe(false)
  })
})

describe('meResponseSchema: ответ GET /me', () => {
  it('{ teacher }', () => {
    expect(meResponseSchema.parse({ teacher: TEACHER })).toEqual({ teacher: TEACHER })
  })

  it('учитель без обёртки { teacher } — отказ', () => {
    expect(meResponseSchema.safeParse(TEACHER).success).toBe(false)
  })

  it('accessToken в ответе me отбрасывается', () => {
    expect(meResponseSchema.parse({ accessToken: ACCESS_TOKEN, teacher: TEACHER })).toEqual({ teacher: TEACHER })
  })
})

describe('messageResponseSchema: 202 register и forgot-password', () => {
  it.each(['Check your email to finish registration', 'If an account with a password exists for this email, we sent a reset link'])(
    '%s',
    (message) => {
      expect(messageResponseSchema.parse({ message })).toEqual({ message })
    },
  )

  it.each([
    ['нет message', {}],
    ['message не строка', { message: 42 }],
  ])('отклоняет: %s', (_name, body) => {
    expect(messageResponseSchema.safeParse(body).success).toBe(false)
  })
})

describe('apiErrorResponseSchema: тело ошибки', () => {
  it.each([
    ['401 входа', { error: 'Wrong email or password' }],
    ['401 сессии', { error: 'Session is invalid or expired, sign in again' }],
    ['429', { error: 'Too many attempts, try again later' }],
    ['500', { error: 'Internal Server Error' }],
  ])('%s — только error', (_name, body) => {
    expect(apiErrorResponseSchema.parse(body)).toEqual(body)
  })

  it('400 валидации — error и issues с путями полей', () => {
    const body = {
      error: 'Validation failed',
      issues: [
        { path: ['email'], message: 'Invalid email' },
        { path: ['password'], message: 'Password must be at least 4 characters' },
      ],
    }

    expect(apiErrorResponseSchema.parse(body)).toEqual(body)
  })

  it('пустой путь (ошибка всего тела) допустим', () => {
    expect(apiErrorResponseSchema.parse({ error: 'Validation failed', issues: [{ path: [], message: 'Invalid input' }] }).issues).toHaveLength(1)
  })

  it.each([
    ['нет error', { issues: [] }],
    ['error не строка', { error: { message: 'x' } }],
    ['issues не массив', { error: 'x', issues: 'bad' }],
    ['issue без message', { error: 'x', issues: [{ path: ['email'] }] }],
    ['путь числом', { error: 'x', issues: [{ path: [0], message: 'm' }] }],
  ])('отклоняет: %s', (_name, body) => {
    expect(apiErrorResponseSchema.safeParse(body).success).toBe(false)
  })

  it('лишние поля ошибки (например, stack) отбрасываются', () => {
    expect(apiErrorResponseSchema.parse({ error: 'Internal Server Error', stack: 'at x (/srv/app.js:1:1)' })).toEqual({ error: 'Internal Server Error' })
  })
})
