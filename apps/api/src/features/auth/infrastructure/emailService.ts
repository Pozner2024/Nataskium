// Почта приложения через Resend REST API (fetch, без npm-пакета resend). Письма: подтверждение email,
// «аккаунт уже есть», сброс пароля, «пароль изменён» и «привязан Google». Ссылки строятся здесь из сырого токена; токен — во фрагменте URL, не в query
import { z } from 'zod'
import { ExternalServiceError } from '../../../shared/errors'
import type { EmailSender } from '../types'
import { RESET_PASSWORD_PATH, SIGN_IN_PATH, VERIFY_EMAIL_PATH, webPageUrl } from '../webPaths'
import { EMAIL_TEMPLATES } from './emailTemplates'

const RESEND_API_URL = 'https://api.resend.com/emails'
const RESEND_SERVICE = 'resend'
const EMAIL_TIMEOUT_MS = 8000
const APP_NAME = 'Nataskium'
const TOKEN_FRAGMENT_PARAM = 'token'

// Ответ Resend при успехе; содержимое не используется, но формат проверяем, а не верим ему
const resendResponseSchema = z.object({ id: z.string() })

type Message = { to: string; subject: string; html: string; text: string }

export type ResendEmailSenderOptions = {
  apiKey: string
  from: string
  webOrigin: string
  // Из PENDING_REGISTRATION_TTL_MS: срок в тексте письма совпадает со сроком записи регистрации
  verificationLinkTtlHours: number
  // Из PASSWORD_RESET_TTL_MS
  passwordResetLinkTtlHours: number
}

// Имя учителя в HTML письма — только через эту функцию: иначе HTML-инъекция в письме
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

export function makeResendEmailSender(options: ResendEmailSenderOptions): EmailSender {
  const from = `${APP_NAME} <${options.from}>`

  async function send(message: Message): Promise<void> {
    let response: Response
    try {
      response = await fetch(RESEND_API_URL, {
        method: 'POST',
        headers: { Authorization: `Bearer ${options.apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ from, to: [message.to], subject: message.subject, html: message.html, text: message.text }),
        signal: AbortSignal.timeout(EMAIL_TIMEOUT_MS),
      })
    } catch {
      // Таймаут или сеть: исходную ошибку не прокидываем — в ней бывает адрес запроса
      throw new ExternalServiceError(RESEND_SERVICE, null)
    }

    // Тело ответа об ошибке не читаем и не логируем: в нём бывает адрес получателя. Освобождаем его, чтобы
    // соединение вернулось в пул
    if (!response.ok) {
      await response.body?.cancel()
      throw new ExternalServiceError(RESEND_SERVICE, response.status)
    }
    const body: unknown = await response.json().catch(() => null)
    if (!resendResponseSchema.safeParse(body).success) throw new ExternalServiceError(RESEND_SERVICE, response.status)
  }

  return {
    async sendVerificationEmail(to, rawToken, locale) {
      const link = `${webPageUrl(options.webOrigin, locale, VERIFY_EMAIL_PATH)}#${TOKEN_FRAGMENT_PARAM}=${encodeURIComponent(rawToken)}`
      const templates = EMAIL_TEMPLATES[locale]
      // Без имени: его задал ещё не подтверждённый регистрирующийся, и оно попало бы в письмо с нашего домена
      const hello = templates.greeting(null, escapeHtml)
      await send({ to, ...templates.verification({ hello, link, hours: options.verificationLinkTtlHours }) })
    },

    async sendAccountExistsEmail(to, displayName, locale) {
      const link = webPageUrl(options.webOrigin, locale, SIGN_IN_PATH)
      const templates = EMAIL_TEMPLATES[locale]
      // Имя задал подтверждённый владелец аккаунта; в HTML — только экранированным
      const hello = templates.greeting(displayName, escapeHtml)
      await send({ to, ...templates.accountExists({ hello, link }) })
    },

    async sendPasswordResetEmail(to, rawToken, displayName, locale) {
      const link = `${webPageUrl(options.webOrigin, locale, RESET_PASSWORD_PATH)}#${TOKEN_FRAGMENT_PARAM}=${encodeURIComponent(rawToken)}`
      const templates = EMAIL_TEMPLATES[locale]
      const hello = templates.greeting(displayName, escapeHtml)
      await send({ to, ...templates.passwordReset({ hello, link, hours: options.passwordResetLinkTtlHours }) })
    },

    // Без токена: ссылка ведёт на вход, а сброс учитель запрашивает там сам
    async sendPasswordChangedEmail(to, displayName, locale) {
      const link = webPageUrl(options.webOrigin, locale, SIGN_IN_PATH)
      const templates = EMAIL_TEMPLATES[locale]
      const hello = templates.greeting(displayName, escapeHtml)
      await send({ to, ...templates.passwordChanged({ hello, link }) })
    },

    // Без токена: ссылка ведёт на вход, а сброс учитель запрашивает там сам
    async sendGoogleLinkedEmail(to, displayName, locale) {
      const link = webPageUrl(options.webOrigin, locale, SIGN_IN_PATH)
      const templates = EMAIL_TEMPLATES[locale]
      const hello = templates.greeting(displayName, escapeHtml)
      await send({ to, ...templates.googleLinked({ hello, link }) })
    },
  }
}
