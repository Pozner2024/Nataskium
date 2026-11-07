import {
  type AuthSessionResponse,
  type ForgotPasswordInput,
  type GoogleLinkInput,
  type LoginInput,
  type RegisterInput,
  type ResetPasswordInput,
  type VerifyEmailInput,
  authSessionResponseSchema,
  messageResponseSchema,
} from '@nataskium/shared/schemas'
import { apiRequest, apiRequestWithoutBody } from '@/shared'

// Маршруты API: /api/auth/* (план бэкенда 1.7). Ответы разбираются схемами из @nataskium/shared
export const authApi = {
  login: (input: LoginInput): Promise<AuthSessionResponse> =>
    apiRequest('/auth/login', authSessionResponseSchema, { body: input }),

  async register(input: RegisterInput): Promise<void> {
    await apiRequest('/auth/register', messageResponseSchema, { body: input })
  },

  verifyEmail: (input: VerifyEmailInput): Promise<AuthSessionResponse> =>
    apiRequest('/auth/verify-email', authSessionResponseSchema, { body: input }),

  // Refresh-токен — в httpOnly cookie, тело запроса пустое
  refresh: (): Promise<AuthSessionResponse> => apiRequest('/auth/refresh', authSessionResponseSchema),

  logout: (): Promise<void> => apiRequestWithoutBody('/auth/logout'),

  googleLink: (input: GoogleLinkInput): Promise<AuthSessionResponse> =>
    apiRequest('/auth/google/link', authSessionResponseSchema, { body: input }),

  // 202 и одна фраза для любого email
  async forgotPassword(input: ForgotPasswordInput): Promise<void> {
    await apiRequest('/auth/forgot-password', messageResponseSchema, { body: input })
  },

  // 204: сессия не выдаётся — учитель входит с новым паролем
  resetPassword: (input: ResetPasswordInput): Promise<void> =>
    apiRequestWithoutBody('/auth/reset-password', { body: input }),
}

// Обычная ссылка, не fetch: полный переход на Google и обратно
export const GOOGLE_START_URL = '/api/auth/google/start'
