// Счётчик одновременных загрузок: всего, на учителя и на IP. Занимается до чтения тела: сверх лимита запрос
// отклоняется, не забрав память под тело. Лимит на IP — против нескольких аккаунтов с одного адреса, которые
// медленными телами держали бы весь пул. В памяти процесса — реплика api одна
export type UploadSlotLimits = { total: number; perTeacher: number; perIp: number }

export type UploadSlotOwner = { teacherId: string; ip: string }

// null — свободных слотов нет; иначе функция освобождения (повторный вызов ничего не делает)
export type UploadSlots = { tryAcquire(owner: UploadSlotOwner): (() => void) | null }

function increment(counts: Map<string, number>, key: string): void {
  counts.set(key, (counts.get(key) ?? 0) + 1)
}

function decrement(counts: Map<string, number>, key: string): void {
  const left = (counts.get(key) ?? 1) - 1
  if (left <= 0) counts.delete(key)
  else counts.set(key, left)
}

export function makeUploadSlots({ total, perTeacher, perIp }: UploadSlotLimits): UploadSlots {
  let active = 0
  const byTeacher = new Map<string, number>()
  const byIp = new Map<string, number>()

  return {
    tryAcquire({ teacherId, ip }) {
      if (active >= total) return null
      if ((byTeacher.get(teacherId) ?? 0) >= perTeacher) return null
      if ((byIp.get(ip) ?? 0) >= perIp) return null
      active++
      increment(byTeacher, teacherId)
      increment(byIp, ip)
      let released = false
      return () => {
        if (released) return
        released = true
        active--
        decrement(byTeacher, teacherId)
        decrement(byIp, ip)
      }
    },
  }
}
