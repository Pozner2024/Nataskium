// Лимиты кабинета учителя, на учителя (ключ — teacherId из токена). Числа — конфигурация app.ts, от окружения не зависят.
// Честный учитель открывает список и редактор, сохраняет вручную и может править или удалять задания подряд —
// до порогов он не доходит. Запись строже чтения: тело до 160 КБ, разбор Zod и транзакция с картинками.
// Создание дополнительно ограничено за сутки: удалённые задания хранятся 30 дней, и этот порог задаёт потолок
// строк одного учителя (вручную столько за день не создать; «Взять себе» считается своим лимитом в библиотеке)
const MS_PER_MINUTE = 60 * 1000
const MS_PER_DAY = 24 * 60 * MS_PER_MINUTE
const MAX_TRACKED_KEYS = 100_000
const READS_PER_TEACHER_PER_MINUTE = 120
const WRITES_PER_TEACHER_PER_MINUTE = 60
const CREATES_PER_TEACHER_PER_DAY = 200

export const QUIZ_LIMITS = {
  maxTrackedKeys: MAX_TRACKED_KEYS,
  read: { max: READS_PER_TEACHER_PER_MINUTE, windowMs: MS_PER_MINUTE },
  write: { max: WRITES_PER_TEACHER_PER_MINUTE, windowMs: MS_PER_MINUTE },
  create: { max: CREATES_PER_TEACHER_PER_DAY, windowMs: MS_PER_DAY },
} as const
