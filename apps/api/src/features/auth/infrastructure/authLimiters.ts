import { type RateLimiter, createRateLimiter } from '../../../shared/middleware'
import type { AuthLimits, RateLimit } from '../limits'
import type { EmailQuota, FailureLimiter } from '../types'

// Один ключ на все адреса: счётчик общего потолка писем
const TOTAL_KEY = 'all'
// Не чаще раза в час: во время флуда отказ повторяется на каждый запрос
const TOTAL_WARNING_INTERVAL_MS = 60 * 60 * 1000

type EmailBudget = { perHour: RateLimiter; perDay: RateLimiter }

// Письмо уходит, только если есть место во всех бюджетах — на адрес и общем: сначала проверка всех, затем списание
function makeEmailQuota(name: string, perEmail: EmailBudget, total: EmailBudget): EmailQuota {
  let lastWarningAt = Number.NEGATIVE_INFINITY

  function warnTotalExhausted() {
    const now = Date.now()
    if (now - lastWarningAt < TOTAL_WARNING_INTERVAL_MS) return
    lastWarningAt = now
    console.warn('Email budget exhausted', { quota: name })
  }

  return {
    tryConsume(email) {
      if (!perEmail.perHour.isAllowed(email).allowed) return false
      if (!perEmail.perDay.isAllowed(email).allowed) return false
      if (!total.perHour.isAllowed(TOTAL_KEY).allowed || !total.perDay.isAllowed(TOTAL_KEY).allowed) {
        warnTotalExhausted()
        return false
      }
      perEmail.perHour.hit(email)
      perEmail.perDay.hit(email)
      total.perHour.hit(TOTAL_KEY)
      total.perDay.hit(TOTAL_KEY)
      return true
    },
  }
}

// Ключи с email — только нормализованный emailSchema адрес: иначе A@b.co и a@b.co считались бы раздельно
export function makeAuthLimiters(limits: AuthLimits) {
  const limiter = (limit: RateLimit) => createRateLimiter({ ...limit, maxTrackedKeys: limits.maxTrackedKeys })

  const loginFailures = limiter(limits.loginFailuresPerEmail)
  const deviceFailures = limiter(limits.loginFailuresPerDevice)
  const teacherFailures = limiter(limits.accountFailuresPerTeacher)
  const registrationEmailsPerHour = limiter(limits.registrationEmailsPerHour)
  const registrationEmailsPerDay = limiter(limits.registrationEmailsPerDay)
  const resetEmailsPerHour = limiter(limits.resetEmailsPerHour)
  const resetEmailsPerDay = limiter(limits.resetEmailsPerDay)
  const registrationEmailsTotalPerHour = limiter(limits.registrationEmailsTotalPerHour)
  const registrationEmailsTotalPerDay = limiter(limits.registrationEmailsTotalPerDay)
  const resetEmailsTotalPerHour = limiter(limits.resetEmailsTotalPerHour)
  const resetEmailsTotalPerDay = limiter(limits.resetEmailsTotalPerDay)

  const failureLimiter: FailureLimiter = { reserve: (email) => loginFailures.reserve(email) }
  const deviceFailureLimiter: FailureLimiter = { reserve: (deviceKey) => deviceFailures.reserve(deviceKey) }
  const teacherFailureLimiter: FailureLimiter = { reserve: (teacherId) => teacherFailures.reserve(teacherId) }

  const registrationEmailQuota = makeEmailQuota(
    'registration',
    { perHour: registrationEmailsPerHour, perDay: registrationEmailsPerDay },
    { perHour: registrationEmailsTotalPerHour, perDay: registrationEmailsTotalPerDay },
  )
  const resetEmailQuota = makeEmailQuota(
    'reset',
    { perHour: resetEmailsPerHour, perDay: resetEmailsPerDay },
    { perHour: resetEmailsTotalPerHour, perDay: resetEmailsTotalPerDay },
  )

  const ipLimiters = {
    loginPerIp: limiter(limits.loginPerIp),
    loginPerIpEmail: limiter(limits.loginPerIpEmail),
    registerPerIp: limiter(limits.registerPerIp),
    verifyEmailPerIp: limiter(limits.verifyEmailPerIp),
    sessionPerIp: limiter(limits.sessionPerIp),
    mePerIp: limiter(limits.mePerIp),
    forgotPasswordPerIp: limiter(limits.forgotPasswordPerIp),
    resetPasswordPerIp: limiter(limits.resetPasswordPerIp),
    googleStartPerIp: limiter(limits.googleStartPerIp),
    googleCallbackPerIp: limiter(limits.googleCallbackPerIp),
    googleLinkPerIp: limiter(limits.googleLinkPerIp),
    googleReauthStartPerIp: limiter(limits.googleReauthStartPerIp),
    deleteAccountPerIp: limiter(limits.deleteAccountPerIp),
    changePasswordPerIp: limiter(limits.changePasswordPerIp),
  }

  const all = [
    loginFailures,
    deviceFailures,
    teacherFailures,
    registrationEmailsPerHour,
    registrationEmailsPerDay,
    resetEmailsPerHour,
    resetEmailsPerDay,
    registrationEmailsTotalPerHour,
    registrationEmailsTotalPerDay,
    resetEmailsTotalPerHour,
    resetEmailsTotalPerDay,
    ...Object.values(ipLimiters),
  ]

  return {
    ...ipLimiters,
    failureLimiter,
    deviceFailureLimiter,
    teacherFailureLimiter,
    registrationEmailQuota,
    resetEmailQuota,
    // Для тестов: свежие счётчики между сценариями
    reset: () => all.forEach((each) => each.reset()),
  }
}
