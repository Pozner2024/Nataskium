import { describe, expect, it } from 'vitest'
import { LETTER_CENTERS_VIEW, type Point, ambientRoutes, introLayout, letterRevealProgress, signalRoute } from './layout'

const ROBOT_HALF_WIDTH_VIEW = 125
const HEAD_CENTER_VIEW_X = 592
const LOGO_VIEW_X = 145

const SIZES: Array<[string, number, number]> = [
  ['16:9 прототип', 1920, 1080],
  ['ноутбук', 1280, 720],
  ['планшет 4:3', 1024, 768],
  ['телефон 360', 360, 640],
  ['телефон 390', 390, 844],
  ['телефон прототип', 1080, 2000],
]

describe('introLayout', () => {
  it.each(SIZES)('%s: лого в кадре с полями', (_name, width, height) => {
    const { logo } = introLayout(width, height)
    expect(logo.left).toBeGreaterThan(0)
    expect(logo.left + logo.width).toBeLessThan(width)
    expect(logo.top).toBeGreaterThan(0)
    expect(logo.top + logo.height).toBeLessThan(height)
  })

  it.each(SIZES)('%s: робот на дальней точке не выходит за правый край', (_name, width, height) => {
    const layout = introLayout(width, height)
    const headRight = layout.headRest.x + (layout.robotFarOffset + ROBOT_HALF_WIDTH_VIEW) * layout.logo.scale
    expect(headRight).toBeLessThanOrEqual(width)
    expect(layout.heroScale).toBeGreaterThan(0)
  })

  it('на 1920×1080 совпадает с прототипом', () => {
    const layout = introLayout(1920, 1080)
    expect(layout.logo).toMatchObject({ left: 360, width: 1200 })
    expect(layout.logo.top).toBeCloseTo(426, 0)
    expect(layout.heroScale).toBeCloseTo(2, 1)
    expect(layout.robotFarOffset).toBe(1340)
    expect(layout.heroShift.x + layout.headRest.x).toBe(960)
  })

  it('на 1080×2000 совпадает с прототипом: лого 900 px по центру', () => {
    const layout = introLayout(1080, 2000)
    expect(layout.logo).toMatchObject({ left: 90, width: 900 })
    expect(layout.robotFarOffset).toBe(1340)
  })
  it('голова в начале одного размера на любом кадре одного типа', () => {
    const big = introLayout(1920, 1080)
    const small = introLayout(1280, 720)
    const headPx = (l: ReturnType<typeof introLayout>) => l.heroScale * 243 * l.logo.scale
    expect(headPx(small) / headPx(big)).toBeCloseTo(1280 / 1920, 5)
  })

  it('центр лого по горизонтали совпадает с центром кадра', () => {
    const { logo } = introLayout(390, 844)
    expect(logo.left + logo.width / 2).toBeCloseTo(195, 5)
    expect(LOGO_VIEW_X).toBe(145)
  })
})

describe('letterRevealProgress', () => {
  it('буквы справа появляются по порядку справа налево', () => {
    const { robotFarOffset } = introLayout(1920, 1080)
    const order = (['m', 'u', 'i', 'k', 's', 'a', 't'] as const).map((letter) => letterRevealProgress(LETTER_CENTERS_VIEW[letter], robotFarOffset))
    expect([...order].sort((a, b) => a - b)).toEqual(order)
  })

  it('буквы за дальней точкой робота появляются сразу, без проезда путь пройден', () => {
    expect(letterRevealProgress(LETTER_CENTERS_VIEW.m, 500)).toBe(0)
    expect(letterRevealProgress(LETTER_CENTERS_VIEW.m, 0)).toBe(1)
  })

  it('совпадает с формулой прототипа', () => {
    const progress = letterRevealProgress(LETTER_CENTERS_VIEW.k, 1340)
    expect(progress).toBeCloseTo(1 - (1346 - ROBOT_HALF_WIDTH_VIEW - HEAD_CENTER_VIEW_X) / 1340, 10)
  })
})

describe('signalRoute', () => {
  it('на 1920×1080 как в прототипе: из-за края, поворот 45°, в точку входа', () => {
    const entry = { x: 1300, y: 260 }
    expect(signalRoute(1920, 1080, entry)).toEqual([{ x: 1940, y: 140 }, { x: 1420, y: 140 }, entry])
  })

  it('горизонталь не заходит на шапку вопроса выше ceiling', () => {
    const route = signalRoute(1440, 810, { x: 1100, y: 180 }, 150)
    for (const point of route) expect(point.y).toBeGreaterThanOrEqual(150)
  })

  it('карточка у верха контейнера: спуск укорачивается, дорожка не уходит за верх', () => {
    const route = signalRoute(390, 844, { x: 300, y: 10 })
    for (const point of route) expect(point.y).toBeGreaterThanOrEqual(0)
    const [, turn, end] = route as [Point, Point, Point]
    expect(turn.x - end.x).toBeCloseTo(end.y - turn.y, 10)
  })
})

describe('signalRoute: границы', () => {
  it('потолок ниже точки входа: спуска нет, дорожка горизонтальна и не уходит вверх', () => {
    const entry = { x: 1100, y: 180 }
    const route = signalRoute(1440, 810, entry, 400)
    expect(route.map((point) => point.y)).toEqual([180, 180, 180])
    expect(route[1]).toEqual(entry)
  })

  it('квадратный кадр считается горизонтальным (эталон 1920)', () => {
    const [start] = signalRoute(1000, 1000, { x: 500, y: 500 })
    expect(start!.x).toBeCloseTo(1000 + 20 * (1000 / 1920), 10)
  })
})

describe('ambientRoutes', () => {
  const inside = (point: Point, width: number, height: number) => point.x >= 0 && point.x <= width && point.y >= 0 && point.y <= height

  it.each(SIZES)('%s: четыре дорожки по четыре точки', (_name, width, height) => {
    const routes = ambientRoutes(width, height)
    expect(routes).toHaveLength(4)
    for (const route of routes) expect(route).toHaveLength(4)
  })

  it.each(SIZES)('%s: старт за краем контейнера, остальные точки внутри', (_name, width, height) => {
    for (const [start, ...rest] of ambientRoutes(width, height)) {
      expect(inside(start!, width, height)).toBe(false)
      for (const point of rest) expect(inside(point, width, height)).toBe(true)
    }
  })

  it.each(SIZES)('%s: после прямого участка поворот ровно под 45°', (_name, width, height) => {
    for (const route of ambientRoutes(width, height)) {
      const [, turn, bend] = route as [Point, Point, Point, Point]
      expect(Math.abs(bend.x - turn.x)).toBeGreaterThan(0)
      expect(Math.abs(bend.x - turn.x)).toBeCloseTo(Math.abs(bend.y - turn.y))
    }
  })

  it.each(SIZES)('%s: участки до и после поворота прямые (горизонталь или вертикаль)', (_name, width, height) => {
    for (const route of ambientRoutes(width, height)) {
      const [start, turn, bend, end] = route as [Point, Point, Point, Point]
      expect(start.x === turn.x || start.y === turn.y).toBe(true)
      expect(bend.x === end.x || bend.y === end.y).toBe(true)
    }
  })

  it('первая дорожка — нижняя левая: старт у левого края за кадром, в нижней половине', () => {
    const [first] = ambientRoutes(1920, 1080)
    expect(first![0]!.x).toBeLessThan(0)
    expect(first![0]!.y).toBeGreaterThan(1080 / 2)
  })

  it('порядок дорожек: нижняя левая, правая, верхняя правая, левая — каждая со своего края', () => {
    const width = 1280
    const height = 720
    const starts = ambientRoutes(width, height).map((route) => route[0]!)
    expect(starts[0]!.x).toBeLessThan(0)
    expect(starts[1]!.y).toBeGreaterThan(height)
    expect(starts[2]!.x).toBeGreaterThan(width)
    expect(starts[3]!.y).toBeLessThan(0)
  })
})
