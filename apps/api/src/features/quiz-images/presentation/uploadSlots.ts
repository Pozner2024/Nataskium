// Счётчик одновременных загрузок, всего и на учителя. Занимается до чтения тела: сверх лимита запрос
// отклоняется, не забрав память под тело. В памяти процесса — реплика api одна
export type UploadSlotLimits = { total: number; perTeacher: number }

// null — свободных слотов нет; иначе функция освобождения (повторный вызов ничего не делает)
export type UploadSlots = { tryAcquire(teacherId: string): (() => void) | null }

export function makeUploadSlots({ total, perTeacher }: UploadSlotLimits): UploadSlots {
  let active = 0
  const byTeacher = new Map<string, number>()

  function release(teacherId: string): void {
    active--
    const left = (byTeacher.get(teacherId) ?? 1) - 1
    if (left <= 0) byTeacher.delete(teacherId)
    else byTeacher.set(teacherId, left)
  }

  return {
    tryAcquire(teacherId) {
      const mine = byTeacher.get(teacherId) ?? 0
      if (active >= total || mine >= perTeacher) return null
      active++
      byTeacher.set(teacherId, mine + 1)
      let released = false
      return () => {
        if (released) return
        released = true
        release(teacherId)
      }
    },
  }
}
