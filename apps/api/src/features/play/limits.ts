// Лимиты публичных маршрутов ученика, на IP. Мягкие: за школьным NAT играет целый класс.
// Числа — конфигурация app.ts, от окружения не зависят
const MS_PER_MINUTE = 60 * 1000
const MAX_TRACKED_KEYS = 100_000
const GET_PER_MINUTE = 120
const CHECK_PER_MINUTE = 600
const FINISH_PER_MINUTE = 120

export const PLAY_LIMITS = {
  maxTrackedKeys: MAX_TRACKED_KEYS,
  get: { max: GET_PER_MINUTE, windowMs: MS_PER_MINUTE },
  check: { max: CHECK_PER_MINUTE, windowMs: MS_PER_MINUTE },
  finish: { max: FINISH_PER_MINUTE, windowMs: MS_PER_MINUTE },
} as const
