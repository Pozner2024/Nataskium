import type { Locale } from '@nataskium/shared/locales'
import {
  type AuthSessionResponse,
  type ChangePasswordInput,
  type DeleteAccountInput,
  type ForgotPasswordInput,
  type GoogleReauthStartInput,
  type GoogleLinkInput,
  type LoginInput,
  type RegisterInput,
  type ResetPasswordInput,
  type VerifyEmailInput,
  authSessionResponseSchema,
  googleReauthStartResponseSchema,
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

  // Остальные сессии учителя сервер удаляет, этот браузер получает новую
  changePassword: (input: ChangePasswordInput, accessToken: string): Promise<AuthSessionResponse> =>
    apiRequest('/auth/change-password', authSessionResponseSchema, { body: input, accessToken }),

  // 204: аккаунт и все сессии удалены, refresh-cookie сервер стирает
  deleteAccount: (input: DeleteAccountInput, accessToken: string): Promise<void> =>
    apiRequestWithoutBody('/auth/delete-account', { body: input, accessToken }),

  // Аккаунт без пароля: адрес входа в Google; после входа API удаляет аккаунт и ведёт на страницу итога
  async googleReauthStart(input: GoogleReauthStartInput, accessToken: string): Promise<string> {
    const { url } = await apiRequest('/auth/google/reauth/start', googleReauthStartResponseSchema, { body: input, accessToken })
    return url
  },
}

// Обычная ссылка, не fetch: полный переход на Google и обратно. Язык — чтобы после возврата учитель остался на нём
export function googleStartUrl(locale: Locale): string {
  return `/api/auth/google/start?locale=${locale}`
}
