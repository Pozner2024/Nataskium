import type { Locale } from '@nataskium/shared/locales'
import type { EmailSender } from '../../src/features/auth'

export type SentEmail =
  | { kind: 'verification'; to: string; rawToken: string; locale: Locale }
  | { kind: 'accountExists'; to: string; displayName: string | null | undefined; locale: Locale }
  | { kind: 'passwordReset'; to: string; rawToken: string; displayName: string | null | undefined; locale: Locale }
  | { kind: 'passwordChanged'; to: string; displayName: string | null | undefined; locale: Locale }
  | { kind: 'googleLinked'; to: string; displayName: string | null | undefined; locale: Locale }

// Фейк для тестов: письма не отправляются, а запоминаются; failWith — проверить, что сбой почты не ломает ответ
export function makeRecordingEmailSender(options: { failWith?: Error } = {}) {
  const sent: SentEmail[] = []

  async function record(email: SentEmail): Promise<void> {
    sent.push(email)
    if (options.failWith) throw options.failWith
  }

  const sender: EmailSender = {
    // Лишние аргументы записываются: так видно, если в письмо подтверждения снова начнут передавать имя
    sendVerificationEmail: (to, rawToken, locale, ...extra: unknown[]) =>
      record({ kind: 'verification', to, rawToken, locale, ...(extra.length > 0 ? { extra } : {}) }),
    sendAccountExistsEmail: (to, displayName, locale) => record({ kind: 'accountExists', to, displayName, locale }),
    sendPasswordResetEmail: (to, rawToken, displayName, locale) => record({ kind: 'passwordReset', to, rawToken, displayName, locale }),
    sendPasswordChangedEmail: (to, displayName, locale) => record({ kind: 'passwordChanged', to, displayName, locale }),
    sendGoogleLinkedEmail: (to, displayName, locale) => record({ kind: 'googleLinked', to, displayName, locale }),
  }

  return { sender, sent }
}
