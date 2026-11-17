import { describe, expect, it } from 'vitest'
import { autoScrollStep, exceedsThreshold, hitTarget, type Rect } from './dragGeometry'

const rect = (top: number, bottom: number, left = 0, right = 360): Rect => ({ top, bottom, left, right })

describe('exceedsThreshold', () => {
  it('сдвиг меньше порога — ещё не перетаскивание', () => {
    expect(exceedsThreshold({ x: 10, y: 10 }, { x: 14, y: 14 }, 8)).toBe(false)
  })

  it('сдвиг на порог и больше — перетаскивание, в любую сторону', () => {
    expect(exceedsThreshold({ x: 10, y: 10 }, { x: 10, y: 18 }, 8)).toBe(true)
    expect(exceedsThreshold({ x: 10, y: 10 }, { x: 2, y: 10 }, 8)).toBe(true)
  })
})

describe('hitTarget', () => {
  const tray = rect(56, 186)
  const cards = [rect(200, 320), rect(334, 454), null, rect(470, 590)]

  it('точка внутри карточки — её определение, включая границы', () => {
    expect(hitTarget({ x: 100, y: 250 }, tray, cards)).toEqual({ kind: 'definition', index: 0 })
    expect(hitTarget({ x: 0, y: 334 }, tray, cards)).toEqual({ kind: 'definition', index: 1 })
    expect(hitTarget({ x: 360, y: 590 }, tray, cards)).toEqual({ kind: 'definition', index: 3 })
  })

  it('промежуток между карточками и место вне всего — цели нет', () => {
    expect(hitTarget({ x: 100, y: 327 }, tray, cards)).toBeNull()
    expect(hitTarget({ x: 100, y: 900 }, tray, cards)).toBeNull()
    expect(hitTarget({ x: 400, y: 250 }, tray, cards)).toBeNull()
  })

  it('лоток важнее карточки, уехавшей под него', () => {
    const under = [rect(100, 220)]
    expect(hitTarget({ x: 100, y: 150 }, tray, under)).toEqual({ kind: 'tray' })
    expect(hitTarget({ x: 100, y: 200 }, tray, under)).toEqual({ kind: 'definition', index: 0 })
  })

  it('без лотка и без размеров карточки (не отрисована) — только видимые цели', () => {
    expect(hitTarget({ x: 100, y: 150 }, null, [null, rect(100, 220)])).toEqual({ kind: 'definition', index: 1 })
  })
})

describe('autoScrollStep', () => {
  const zone = { top: 186, bottom: 780 }

  it('в середине экрана — без прокрутки', () => {
    expect(autoScrollStep(480, zone, 60, 20)).toBe(0)
  })

  it('у нижнего края — вниз, ближе к краю быстрее, не больше максимума', () => {
    const near = autoScrollStep(730, zone, 60, 20)
    const nearer = autoScrollStep(770, zone, 60, 20)
    expect(near).toBeGreaterThan(0)
    expect(nearer).toBeGreaterThan(near)
    expect(autoScrollStep(900, zone, 60, 20)).toBe(20)
  })

  it('в полосе под лотком — вверх, у самой границы лотка с максимальной скоростью', () => {
    expect(autoScrollStep(230, zone, 60, 20)).toBeLessThan(0)
    expect(autoScrollStep(186, zone, 60, 20)).toBe(-20)
  })

  it('над лотком прокрутки нет: там слово возвращают', () => {
    expect(autoScrollStep(100, zone, 60, 20)).toBe(0)
  })
})
