import { createRateLimiter } from '../../../shared/middleware'
import type { AuthLimits, RateLimit } from '../limits'
import type { EmailQuota, FailureLimiter } from '../types'

// Ключи с email — только нормализованный emailSchema адрес: иначе A@b.co и a@b.co считались бы раздельно
export function makeAuthLimiters(limits: AuthLimits) {
  const limiter = (limit: RateLimit) => createRateLimiter({ ...limit, maxTrackedKeys: limits.maxTrackedKeys })

  const loginFailures = limiter(limits.loginFailuresPerEmail)
  const registrationEmailsPerHour = limiter(limits.registrationEmailsPerHour)
  const registrationEmailsPerDay = limiter(limits.registrationEmailsPerDay)

  const failureLimiter: FailureLimiter = { reserve: (email) => loginFailures.reserve(email) }

  // Письмо уходит, только если есть место и в часовом, и в суточном бюджете: сначала проверка обоих, затем списание
  const registrationEmailQuota: EmailQuota = {
    tryConsume(email) {
      if (!registrationEmailsPerHour.isAllowed(email).allowed) return false
      if (!registrationEmailsPerDay.isAllowed(email).allowed) return false
      registrationEmailsPerHour.hit(email)
      registrationEmailsPerDay.hit(email)
      return true
    },
  }

  const ipLimiters = {
    loginPerIp: limiter(limits.loginPerIp),
    loginPerIpEmail: limiter(limits.loginPerIpEmail),
    registerPerIp: limiter(limits.registerPerIp),
    verifyEmailPerIp: limiter(limits.verifyEmailPerIp),
    sessionPerIp: limiter(limits.sessionPerIp),
  }

  const all = [loginFailures, registrationEmailsPerHour, registrationEmailsPerDay, ...Object.values(ipLimiters)]

  return {
    ...ipLimiters,
    failureLimiter,
    registrationEmailQuota,
    // Для тестов: свежие счётчики между сценариями
    reset: () => all.forEach((each) => each.reset()),
  }
}

export type AuthLimiters = ReturnType<typeof makeAuthLimiters>
