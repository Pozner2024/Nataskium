import { describe, expect, it, vi } from 'vitest'
import { createFadeEntrance } from './fadeEntrance'

describe('createFadeEntrance (reduced motion)', () => {
  it('показывает карточку сразу и проявляет её без движения', async () => {
    const finish = vi.fn()
    const animate = vi.fn(() => ({ finish }))
    const onReady = vi.fn()
    const entrance = createFadeEntrance()
    await entrance.run({ card: { animate } as unknown as HTMLElement, dots: null, items: [], ceiling: null, onReady })
    expect(onReady).toHaveBeenCalledTimes(1)
    expect(animate).toHaveBeenCalledWith([{ opacity: 0 }, { opacity: 1 }], expect.objectContaining({ duration: 300 }))
    entrance.cancel()
    expect(finish).toHaveBeenCalledTimes(1)
  })

  it('без Web Animations API просто показывает карточку', async () => {
    const onReady = vi.fn()
    await createFadeEntrance().run({ card: {} as HTMLElement, dots: null, items: [], ceiling: null, onReady })
    expect(onReady).toHaveBeenCalledTimes(1)
  })
})
