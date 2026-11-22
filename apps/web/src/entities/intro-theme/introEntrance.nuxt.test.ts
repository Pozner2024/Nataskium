import { afterEach, describe, expect, it, vi } from 'vitest'
import { createIntroEntrance, createIntroSound } from '@/entities/intro-theme'

describe('createIntroEntrance: выбор вылета по теме', () => {
  afterEach(() => vi.restoreAllMocks())

  it('при reduced motion — плавное проявление: без движения, карточка проявляется через Web Animations', async () => {
    const stage = document.createElement('div')
    const card = document.createElement('div')
    const animate = vi.fn(() => ({ finish: vi.fn() }) as unknown as Animation)
    card.animate = animate
    const onReady = vi.fn()
    const entrance = createIntroEntrance('nataskium-night', stage, true, null)
    await entrance!.run({ card, dots: null, items: [], ceiling: null, onReady })
    expect(animate).toHaveBeenCalledWith([{ opacity: 0 }, { opacity: 1 }], expect.anything())
    expect(stage.querySelector('svg')).toBeNull()
  })

  it('без reduced motion — вылет темы Nataskium, а не проявление', async () => {
    const stage = document.createElement('div')
    const card = document.createElement('div')
    stage.append(card)
    const animate = vi.fn()
    card.animate = animate
    const onReady = vi.fn()
    const entrance = createIntroEntrance('nataskium-day', stage, false, null)
    // Карточка без геометрии: вылет сразу уходит в конечное состояние, проявление при этом не вызывается
    await entrance!.run({ card, dots: null, items: [], ceiling: null, onReady })
    expect(onReady).toHaveBeenCalled()
    expect(animate).not.toHaveBeenCalled()
  })

  it('неизвестный ключ — тема по умолчанию (тема кодом), вылет есть', () => {
    expect(createIntroEntrance('space', document.createElement('div'), true, null)).not.toBeNull()
  })

  it('звуки есть у темы кодом и до unlock ничего не создают', () => {
    const create = vi.fn()
    vi.stubGlobal('AudioContext', create)
    const sound = createIntroSound('nataskium-night')
    expect(sound).not.toBeNull()
    sound!.play('head')
    expect(create).not.toHaveBeenCalled()
    vi.unstubAllGlobals()
  })
})
