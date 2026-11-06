import type { EmailSender } from '../types'

class EmailNotConfiguredError extends Error {
  constructor() {
    super('Email sending is not configured')
    this.name = 'EmailNotConfiguredError'
  }
}

// Вне production без RESEND_API_KEY и EMAIL_FROM: письма не уходят, sendInBackground пишет в лог только тип ошибки
export function makeUnconfiguredEmailSender(): EmailSender {
  const fail = async () => {
    throw new EmailNotConfiguredError()
  }
  return {
    sendVerificationEmail: fail,
    sendAccountExistsEmail: fail,
    sendPasswordResetEmail: fail,
    sendPasswordChangedEmail: fail,
    sendGoogleLinkedEmail: fail,
  }
}
