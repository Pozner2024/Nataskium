// Лимиты загрузки картинок. Числа — конфигурация app.ts, от окружения не зависят.
// На IP больше, чем на учителя: за школьным NAT работают несколько учителей
const MS_PER_HOUR = 60 * 60 * 1000
const MAX_TRACKED_KEYS = 100_000
const UPLOADS_PER_TEACHER_PER_HOUR = 120
const UPLOADS_PER_IP_PER_HOUR = 300
// Одновременные загрузки ограничиваются до чтения тела: каждая держит в памяти до 16 МБ тела и 15 МБ байтов файла
const MAX_CONCURRENT_UPLOADS = 4
const MAX_CONCURRENT_UPLOADS_PER_TEACHER = 2

export const IMAGE_UPLOAD_LIMITS = {
  maxTrackedKeys: MAX_TRACKED_KEYS,
  perTeacher: { max: UPLOADS_PER_TEACHER_PER_HOUR, windowMs: MS_PER_HOUR },
  perIp: { max: UPLOADS_PER_IP_PER_HOUR, windowMs: MS_PER_HOUR },
  concurrent: { total: MAX_CONCURRENT_UPLOADS, perTeacher: MAX_CONCURRENT_UPLOADS_PER_TEACHER },
} as const
