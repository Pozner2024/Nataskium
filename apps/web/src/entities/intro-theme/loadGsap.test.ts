import { describe, expect, it, vi } from 'vitest'
import { loadGsap } from './loadGsap'

describe('loadGsap', () => {
  it('отдаёт GSAP с таймлайнами', async () => {
    const gsap = await loadGsap()
    expect(typeof gsap.timeline).toBe('function')
  })

  it('загружает библиотеку один раз', () => {
    expect(loadGsap()).toBe(loadGsap())
  })

  it('библиотека не загрузилась за GSAP_LOAD_TIMEOUT_MS — ошибка, игра идёт без анимации; следующий вызов пробует снова', async () => {
    vi.resetModules()
    vi.doMock('gsap', () => new Promise(() => {}))
    vi.useFakeTimers()
    try {
      const fresh = await import('./loadGsap')
      const first = fresh.loadGsap()
      const failed = expect(first).rejects.toThrow('timed out')
      await vi.advanceTimersByTimeAsync(fresh.GSAP_LOAD_TIMEOUT_MS)
      await failed
      expect(fresh.loadGsap()).not.toBe(first)
    } finally {
      vi.useRealTimers()
      vi.doUnmock('gsap')
    }
  })
})
