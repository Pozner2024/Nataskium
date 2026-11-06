import type { Clock, PasswordResetRepository, PendingRegistrationRepository, RefreshTokenRepository } from '../types'

export type CleanupDeps = {
  refreshTokens: RefreshTokenRepository
  pendingRegistrations: PendingRegistrationRepository
  passwordResets: PasswordResetRepository
  now: Clock
}

// Удаляет истёкшие refresh-токены, регистрации и ссылки сброса пароля (минимизация данных). Отозванные токены — только по сроку:
// до него по ним срабатывает обнаружение повторного использования. Сбой не роняет процесс — следующий запуск повторит
export function makeCleanupExpiredAuthRecords(deps: CleanupDeps) {
  return async function cleanupExpiredAuthRecords(): Promise<void> {
    const now = deps.now()
    try {
      const [refreshTokens, pendingRegistrations, passwordResets] = await Promise.all([
        deps.refreshTokens.deleteExpired(now),
        deps.pendingRegistrations.deleteExpired(now),
        deps.passwordResets.deleteExpired(now),
      ])
      if (refreshTokens > 0 || pendingRegistrations > 0 || passwordResets > 0) {
        console.log('[cleanup] expired auth records removed', { refreshTokens, pendingRegistrations, passwordResets })
      }
    } catch (error) {
      // Только тип: в ошибке Prisma бывают параметры запроса
      console.error('[cleanup] failed', { errorType: error instanceof Error ? error.name : typeof error })
    }
  }
}

type Timers = {
  setInterval: typeof setInterval
  clearInterval: typeof clearInterval
}

export type CleanupScheduleOptions = {
  cleanup: () => Promise<void>
  intervalMs: number
  // Подменяются в тестах; по умолчанию — глобальные таймеры Node
  timers?: Timers
}

// Первый запуск сразу, дальше по интервалу. Запуски не накладываются: если очистка идёт дольше интервала,
// следующий тик пропускается. Ошибка запуска только логируется. unref() — таймер не мешает процессу завершиться
export function startCleanupSchedule({ cleanup, intervalMs, timers = { setInterval, clearInterval } }: CleanupScheduleOptions) {
  let isCleanupRunning = false

  async function run(): Promise<void> {
    if (isCleanupRunning) return
    isCleanupRunning = true
    try {
      await cleanup()
    } catch (error) {
      // Запуск идёт через void: необработанный rejection уронил бы процесс
      console.error('[cleanup] schedule run failed', { errorType: error instanceof Error ? error.name : typeof error })
    } finally {
      isCleanupRunning = false
    }
  }

  void run()
  const timer = timers.setInterval(() => void run(), intervalMs)
  timer.unref()

  return {
    run,
    stop: () => timers.clearInterval(timer),
  }
}
