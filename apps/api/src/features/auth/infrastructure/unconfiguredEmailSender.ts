import type { EmailSender } from '../types'

class EmailNotConfiguredError extends Error {
  constructor() {
    super('Email sending is not configured')
    this.name = 'EmailNotConfiguredError'
  }
}

// До части F (Resend): письма не уходят, sendInBackground пишет в лог только операцию и тип этой ошибки
export function makeUnconfiguredEmailSender(): EmailSender {
  const fail = async () => {
    throw new EmailNotConfiguredError()
  }
  return { sendVerificationEmail: fail, sendAccountExistsEmail: fail }
}
