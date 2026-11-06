// Почта приложения через Resend REST API (fetch, без npm-пакета resend). Письма: подтверждение email,
// «аккаунт уже есть», сброс пароля, «пароль изменён» и «привязан Google». Ссылки строятся здесь из сырого токена; токен — во фрагменте URL, не в query
import { z } from 'zod'
import { ExternalServiceError } from '../../../shared/errors'
import type { EmailSender } from '../types'
import { RESET_PASSWORD_PATH, SIGN_IN_PATH, VERIFY_EMAIL_PATH } from '../webPaths'

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

function greeting(displayName: string | null | undefined): { html: string; text: string } {
  if (displayName === null || displayName === undefined) return { html: 'Hi,', text: 'Hi,' }
  return { html: `Hi ${escapeHtml(displayName)},`, text: `Hi ${displayName},` }
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
    async sendVerificationEmail(to, rawToken) {
      const link = `${options.webOrigin}${VERIFY_EMAIL_PATH}#${TOKEN_FRAGMENT_PARAM}=${encodeURIComponent(rawToken)}`
      // Без имени: его задал ещё не подтверждённый регистрирующийся, и оно попало бы в письмо с нашего домена
      const hello = greeting(null)
      const hours = options.verificationLinkTtlHours
      // В HTML только серверные значения: origin из env и токен из CSPRNG в base64url
      await send({
        to,
        subject: `Confirm your email — ${APP_NAME}`,
        html: `
          <p>${hello.html}</p>
          <p>Thanks for signing up for ${APP_NAME}!</p>
          <p>Please confirm your email address by clicking the link below and entering the password you chose:</p>
          <p><a href="${link}">Confirm email</a></p>
          <p>The link expires in ${hours} hours. If you didn't sign up, just ignore this email.</p>
        `,
        text: [
          hello.text,
          '',
          `Thanks for signing up for ${APP_NAME}!`,
          'Please confirm your email address by opening the link below and entering the password you chose:',
          link,
          '',
          `The link expires in ${hours} hours. If you didn't sign up, just ignore this email.`,
        ].join('\n'),
      })
    },

    async sendAccountExistsEmail(to, displayName) {
      const link = `${options.webOrigin}${SIGN_IN_PATH}`
      // Имя задал подтверждённый владелец аккаунта; в HTML — только экранированным
      const hello = greeting(displayName)
      await send({
        to,
        subject: `You already have an account — ${APP_NAME}`,
        html: `
          <p>${hello.html}</p>
          <p>Someone tried to sign up with this email, but an account already exists.</p>
          <p>Just <a href="${link}">sign in</a> as usual. If it wasn't you, just ignore this email.</p>
        `,
        text: [
          hello.text,
          '',
          'Someone tried to sign up with this email, but an account already exists.',
          `Just sign in as usual: ${link}`,
          "If it wasn't you, just ignore this email.",
        ].join('\n'),
      })
    },

    async sendPasswordResetEmail(to, rawToken, displayName) {
      const link = `${options.webOrigin}${RESET_PASSWORD_PATH}#${TOKEN_FRAGMENT_PARAM}=${encodeURIComponent(rawToken)}`
      // Имя задал подтверждённый владелец аккаунта; в HTML — только экранированным
      const hello = greeting(displayName)
      const hours = options.passwordResetLinkTtlHours
      const expiry = `The link expires in ${hours} ${hours === 1 ? 'hour' : 'hours'} and works once.`
      await send({
        to,
        subject: `Reset your password — ${APP_NAME}`,
        html: `
          <p>${hello.html}</p>
          <p>We received a request to reset your password.</p>
          <p>Click the link below to choose a new one:</p>
          <p><a href="${link}">Reset password</a></p>
          <p>${expiry} If you didn't request this, just ignore this email: your password stays the same.</p>
        `,
        text: [
          hello.text,
          '',
          'We received a request to reset your password.',
          'Open the link below to choose a new one:',
          link,
          '',
          `${expiry} If you didn't request this, just ignore this email: your password stays the same.`,
        ].join('\n'),
      })
    },

    // Без токена: ссылка ведёт на вход, а сброс учитель запрашивает там сам
    async sendPasswordChangedEmail(to, displayName) {
      const link = `${options.webOrigin}${SIGN_IN_PATH}`
      // Имя задал подтверждённый владелец аккаунта; в HTML — только экранированным
      const hello = greeting(displayName)
      await send({
        to,
        subject: `Your password was changed — ${APP_NAME}`,
        html: `
          <p>${hello.html}</p>
          <p>The password for your ${APP_NAME} account was just changed, and you were signed out on all devices.</p>
          <p>If this was you, you can <a href="${link}">sign in</a> with your new password.</p>
          <p>If this wasn't you, reset your password immediately: open the <a href="${link}">sign-in page</a> and choose "Forgot password".</p>
        `,
        text: [
          hello.text,
          '',
          `The password for your ${APP_NAME} account was just changed, and you were signed out on all devices.`,
          `If this was you, you can sign in with your new password: ${link}`,
          `If this wasn't you, reset your password immediately: open ${link} and choose "Forgot password".`,
        ].join('\n'),
      })
    },

    // Без токена: ссылка ведёт на вход, а сброс учитель запрашивает там сам
    async sendGoogleLinkedEmail(to, displayName) {
      const link = `${options.webOrigin}${SIGN_IN_PATH}`
      // Имя задал подтверждённый владелец аккаунта; в HTML — только экранированным
      const hello = greeting(displayName)
      await send({
        to,
        subject: `Google sign-in was added to your account — ${APP_NAME}`,
        html: `
          <p>${hello.html}</p>
          <p>Sign-in with Google was just added to your ${APP_NAME} account. You can now sign in with Google or with your password.</p>
          <p>If this wasn't you, reset your password immediately: open the <a href="${link}">sign-in page</a> and choose "Forgot password".</p>
        `,
        text: [
          hello.text,
          '',
          `Sign-in with Google was just added to your ${APP_NAME} account. You can now sign in with Google or with your password.`,
          `If this wasn't you, reset your password immediately: open ${link} and choose "Forgot password".`,
        ].join('\n'),
      })
    },
  }
}
