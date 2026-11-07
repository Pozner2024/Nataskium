import { type RateLimiter, createRateLimiter } from '../../../shared/middleware'
import type { AuthLimits, RateLimit } from '../limits'
import type { EmailQuota, FailureLimiter } from '../types'

// Письмо уходит, только если есть место и в часовом, и в суточном бюджете: сначала проверка обоих, затем списание
function makeEmailQuota(perHour: RateLimiter, perDay: RateLimiter): EmailQuota {
  return {
    tryConsume(email) {
      if (!perHour.isAllowed(email).allowed) return false
      if (!perDay.isAllowed(email).allowed) return false
      perHour.hit(email)
      perDay.hit(email)
      return true
    },
  }
}

// Ключи с email — только нормализованный emailSchema адрес: иначе A@b.co и a@b.co считались бы раздельно
export function makeAuthLimiters(limits: AuthLimits) {
  const limiter = (limit: RateLimit) => createRateLimiter({ ...limit, maxTrackedKeys: limits.maxTrackedKeys })

  const loginFailures = limiter(limits.loginFailuresPerEmail)
  const registrationEmailsPerHour = limiter(limits.registrationEmailsPerHour)
  const registrationEmailsPerDay = limiter(limits.registrationEmailsPerDay)
  const resetEmailsPerHour = limiter(limits.resetEmailsPerHour)
  const resetEmailsPerDay = limiter(limits.resetEmailsPerDay)

  const failureLimiter: FailureLimiter = { reserve: (email) => loginFailures.reserve(email) }

  const registrationEmailQuota = makeEmailQuota(registrationEmailsPerHour, registrationEmailsPerDay)
  const resetEmailQuota = makeEmailQuota(resetEmailsPerHour, resetEmailsPerDay)

  const ipLimiters = {
    loginPerIp: limiter(limits.loginPerIp),
    loginPerIpEmail: limiter(limits.loginPerIpEmail),
    registerPerIp: limiter(limits.registerPerIp),
    verifyEmailPerIp: limiter(limits.verifyEmailPerIp),
    sessionPerIp: limiter(limits.sessionPerIp),
    forgotPasswordPerIp: limiter(limits.forgotPasswordPerIp),
    resetPasswordPerIp: limiter(limits.resetPasswordPerIp),
    googleStartPerIp: limiter(limits.googleStartPerIp),
    googleCallbackPerIp: limiter(limits.googleCallbackPerIp),
    googleLinkPerIp: limiter(limits.googleLinkPerIp),
    deleteAccountPerIp: limiter(limits.deleteAccountPerIp),
  }

  const all = [
    loginFailures,
    registrationEmailsPerHour,
    registrationEmailsPerDay,
    resetEmailsPerHour,
    resetEmailsPerDay,
    ...Object.values(ipLimiters),
  ]

  return {
    ...ipLimiters,
    failureLimiter,
    registrationEmailQuota,
    resetEmailQuota,
    // Для тестов: свежие счётчики между сценариями
    reset: () => all.forEach((each) => each.reset()),
  }
}

export type AuthLimiters = ReturnType<typeof makeAuthLimiters>
