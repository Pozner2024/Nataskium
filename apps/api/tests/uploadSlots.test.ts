import { describe, expect, it } from 'vitest'
import { makeUploadSlots } from '../src/features/quiz-images/presentation/uploadSlots'

const LIMITS = { total: 4, perTeacher: 2, perIp: 2 }

describe('makeUploadSlots', () => {
  it('с одного IP — не больше 2 слотов, даже с разных аккаунтов', () => {
    const slots = makeUploadSlots(LIMITS)

    expect(slots.tryAcquire({ teacherId: 'a', ip: '198.51.100.1' })).not.toBeNull()
    expect(slots.tryAcquire({ teacherId: 'b', ip: '198.51.100.1' })).not.toBeNull()
    expect(slots.tryAcquire({ teacherId: 'c', ip: '198.51.100.1' })).toBeNull()
    expect(slots.tryAcquire({ teacherId: 'c', ip: '198.51.100.2' })).not.toBeNull()
  })

  it('на учителя — не больше 2 слотов с разных IP', () => {
    const slots = makeUploadSlots(LIMITS)
    slots.tryAcquire({ teacherId: 'a', ip: '198.51.100.1' })
    slots.tryAcquire({ teacherId: 'a', ip: '198.51.100.2' })

    expect(slots.tryAcquire({ teacherId: 'a', ip: '198.51.100.3' })).toBeNull()
  })

  it('всего — не больше 4', () => {
    const slots = makeUploadSlots(LIMITS)
    for (let index = 0; index < 4; index++) slots.tryAcquire({ teacherId: `t${index}`, ip: `198.51.100.${index}` })

    expect(slots.tryAcquire({ teacherId: 'x', ip: '198.51.100.9' })).toBeNull()
  })

  it('освобождение возвращает слот учителю и IP; повторный вызов ничего не меняет', () => {
    const slots = makeUploadSlots(LIMITS)
    const first = slots.tryAcquire({ teacherId: 'a', ip: '198.51.100.1' })
    slots.tryAcquire({ teacherId: 'b', ip: '198.51.100.1' })
    first?.()
    first?.()

    expect(slots.tryAcquire({ teacherId: 'c', ip: '198.51.100.1' })).not.toBeNull()
    expect(slots.tryAcquire({ teacherId: 'd', ip: '198.51.100.1' })).toBeNull()
  })
})
