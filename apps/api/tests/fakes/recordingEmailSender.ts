import type { EmailSender } from '../../src/features/auth'

export type SentEmail =
  | { kind: 'verification'; to: string; rawToken: string }
  | { kind: 'accountExists'; to: string; displayName: string | null | undefined }
  | { kind: 'passwordReset'; to: string; rawToken: string; displayName: string | null | undefined }
  | { kind: 'passwordChanged'; to: string; displayName: string | null | undefined }

// Фейк для тестов: письма не отправляются, а запоминаются; failWith — проверить, что сбой почты не ломает ответ
export function makeRecordingEmailSender(options: { failWith?: Error } = {}) {
  const sent: SentEmail[] = []

  async function record(email: SentEmail): Promise<void> {
    sent.push(email)
    if (options.failWith) throw options.failWith
  }

  const sender: EmailSender = {
    // Лишние аргументы записываются: так видно, если в письмо подтверждения снова начнут передавать имя
    sendVerificationEmail: (to, rawToken, ...extra: unknown[]) =>
      record({ kind: 'verification', to, rawToken, ...(extra.length > 0 ? { extra } : {}) }),
    sendAccountExistsEmail: (to, displayName) => record({ kind: 'accountExists', to, displayName }),
    sendPasswordResetEmail: (to, rawToken, displayName) => record({ kind: 'passwordReset', to, rawToken, displayName }),
    sendPasswordChangedEmail: (to, displayName) => record({ kind: 'passwordChanged', to, displayName }),
  }

  return { sender, sent }
}
