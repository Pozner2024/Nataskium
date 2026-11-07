import { z } from 'zod'

// Формы ответов /api/auth/*: фронтенд разбирает ответ этими схемами, API выводит из них свои типы,
// поэтому форма ответа и ожидание фронта не расходятся

// Что учитель видит о себе: без хэша пароля и googleId
export const teacherViewSchema = z.object({
  id: z.uuid(),
  email: z.string(),
  displayName: z.string().nullable(),
  hasPassword: z.boolean(),
  hasGoogle: z.boolean(),
})

// Ответ входа, подтверждения email, привязки Google и refresh. Refresh-токен — только в httpOnly cookie, не в теле
export const authSessionResponseSchema = z.object({
  accessToken: z.string().min(1),
  teacher: teacherViewSchema,
})

export const meResponseSchema = z.object({
  teacher: teacherViewSchema,
})

// 202 регистрации и запроса сброса пароля: одна фраза для любого email
export const messageResponseSchema = z.object({
  message: z.string(),
})

// Тело любой ошибки API (errorHandler): issues — только у 400 валидации, без введённых значений
export const apiErrorResponseSchema = z.object({
  error: z.string(),
  issues: z.array(z.object({ path: z.array(z.string()), message: z.string() })).optional(),
})

export type TeacherView = z.infer<typeof teacherViewSchema>
export type AuthSessionResponse = z.infer<typeof authSessionResponseSchema>
export type MeResponse = z.infer<typeof meResponseSchema>
export type MessageResponse = z.infer<typeof messageResponseSchema>
export type ApiErrorResponse = z.infer<typeof apiErrorResponseSchema>
