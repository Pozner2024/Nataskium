import type { EmailSender } from '../../src/features/auth'

export type SentEmail =
  | { kind: 'verification'; to: string; rawToken: string }
  | { kind: 'accountExists'; to: string }

// Фейк для тестов: письма не отправляются, а запоминаются; failWith — проверить, что сбой почты не ломает ответ
export function makeRecordingEmailSender(options: { failWith?: Error } = {}) {
  const sent: SentEmail[] = []

  async function record(email: SentEmail): Promise<void> {
    sent.push(email)
    if (options.failWith) throw options.failWith
  }

  const sender: EmailSender = {
    sendVerificationEmail: (to, rawToken) => record({ kind: 'verification', to, rawToken }),
    sendAccountExistsEmail: (to) => record({ kind: 'accountExists', to }),
  }

  return { sender, sent }
}
