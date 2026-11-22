import { describe, expect, it } from 'vitest'
import { MAX_CROP_ZOOM, MIN_CROP_ZOOM, OPTION_IMAGE_ASPECT, QUESTION_IMAGE_ASPECT, clampCenter, cropOutputType, cropRect } from './imageCrop'

const SQUARE = { width: 1000, height: 1000 }
const WIDE = { width: 1920, height: 1080 }
const TALL = { width: 600, height: 1200 }
const CENTER = { x: 0.5, y: 0.5 }

// Рамка целиком внутри картинки
function expectInside(image: { width: number; height: number }, rect: { x: number; y: number; width: number; height: number }): void {
  expect(rect.x).toBeGreaterThanOrEqual(0)
  expect(rect.y).toBeGreaterThanOrEqual(0)
  expect(rect.x + rect.width).toBeLessThanOrEqual(image.width + 1e-9)
  expect(rect.y + rect.height).toBeLessThanOrEqual(image.height + 1e-9)
}

describe('cropRect: размер рамки', () => {
  it('16:9 на квадратной картинке при zoom 1: во всю ширину, высота по пропорции', () => {
    const rect = cropRect(SQUARE, QUESTION_IMAGE_ASPECT, MIN_CROP_ZOOM, CENTER)
    expect(rect.width).toBe(1000)
    expect(rect.height).toBeCloseTo(562.5)
    expect(rect.width / rect.height).toBeCloseTo(QUESTION_IMAGE_ASPECT)
    expect(rect.x).toBe(0)
    expect(rect.y).toBeCloseTo(218.75)
  })

  it('16:9 на картинке 16:9 при zoom 1 — вся картинка', () => {
    expect(cropRect(WIDE, QUESTION_IMAGE_ASPECT, MIN_CROP_ZOOM, CENTER)).toEqual({ x: 0, y: 0, width: 1920, height: 1080 })
  })

  it('1:1 на широкой картинке при zoom 1: квадрат во всю высоту по центру', () => {
    const rect = cropRect(WIDE, OPTION_IMAGE_ASPECT, MIN_CROP_ZOOM, CENTER)
    expect(rect).toEqual({ x: 420, y: 0, width: 1080, height: 1080 })
  })

  it('1:1 на высокой картинке при zoom 1: квадрат во всю ширину', () => {
    const rect = cropRect(TALL, OPTION_IMAGE_ASPECT, MIN_CROP_ZOOM, CENTER)
    expect(rect).toEqual({ x: 0, y: 300, width: 600, height: 600 })
  })

  it('zoom уменьшает рамку во столько же раз, пропорция сохраняется', () => {
    const base = cropRect(WIDE, QUESTION_IMAGE_ASPECT, MIN_CROP_ZOOM, CENTER)
    const zoomed = cropRect(WIDE, QUESTION_IMAGE_ASPECT, 2, CENTER)
    const max = cropRect(WIDE, QUESTION_IMAGE_ASPECT, MAX_CROP_ZOOM, CENTER)
    expect(zoomed.width).toBeCloseTo(base.width / 2)
    expect(zoomed.height).toBeCloseTo(base.height / 2)
    expect(max.width).toBeCloseTo(base.width / MAX_CROP_ZOOM)
    expect(zoomed.width / zoomed.height).toBeCloseTo(QUESTION_IMAGE_ASPECT)
  })

  it('zoom с центром по середине оставляет рамку по центру', () => {
    const rect = cropRect(WIDE, QUESTION_IMAGE_ASPECT, 2, CENTER)
    expect(rect.x + rect.width / 2).toBeCloseTo(WIDE.width / 2)
    expect(rect.y + rect.height / 2).toBeCloseTo(WIDE.height / 2)
  })
})

describe('cropRect и clampCenter: рамка не выходит за края', () => {
  const corners = [
    { x: -1, y: -1 },
    { x: 2, y: 2 },
    { x: 0, y: 1 },
    { x: 1, y: 0 },
  ]

  for (const image of [SQUARE, WIDE, TALL]) {
    for (const aspect of [QUESTION_IMAGE_ASPECT, OPTION_IMAGE_ASPECT]) {
      for (const zoom of [MIN_CROP_ZOOM, 2, MAX_CROP_ZOOM]) {
        it(`${image.width}×${image.height}, пропорция ${aspect.toFixed(2)}, zoom ${zoom}: центр за краем прижимается к краю`, () => {
          for (const center of corners) expectInside(image, cropRect(image, aspect, zoom, center))
        })
      }
    }
  }

  it('центр за левым верхним краем — рамка ровно в левом верхнем углу', () => {
    const rect = cropRect(WIDE, OPTION_IMAGE_ASPECT, 2, { x: -5, y: -5 })
    expect(rect.x).toBeCloseTo(0)
    expect(rect.y).toBeCloseTo(0)
  })

  it('центр за правым нижним краем — рамка ровно в правом нижнем углу', () => {
    const rect = cropRect(WIDE, OPTION_IMAGE_ASPECT, 2, { x: 5, y: 5 })
    expect(rect.x + rect.width).toBeCloseTo(WIDE.width)
    expect(rect.y + rect.height).toBeCloseTo(WIDE.height)
  })

  it('clampCenter: допустимый центр не меняется', () => {
    expect(clampCenter(WIDE, OPTION_IMAGE_ASPECT, 2, { x: 0.4, y: 0.6 })).toEqual({ x: 0.4, y: 0.6 })
  })

  it('clampCenter: рамка во всю ширину не двигается по горизонтали', () => {
    expect(clampCenter(SQUARE, QUESTION_IMAGE_ASPECT, MIN_CROP_ZOOM, { x: 0.9, y: 0.5 }).x).toBeCloseTo(0.5)
  })

  it('clampCenter: границы — половина рамки в долях картинки', () => {
    // 16:9 на квадрате: высота рамки 562.5, половина — 0.28125 высоты картинки
    expect(clampCenter(SQUARE, QUESTION_IMAGE_ASPECT, MIN_CROP_ZOOM, { x: 0.5, y: 0 }).y).toBeCloseTo(0.28125)
    expect(clampCenter(SQUARE, QUESTION_IMAGE_ASPECT, MIN_CROP_ZOOM, { x: 0.5, y: 1 }).y).toBeCloseTo(0.71875)
  })
})

describe('cropOutputType', () => {
  it('JPEG остаётся JPEG', () => {
    expect(cropOutputType('image/jpeg')).toBe('image/jpeg')
  })

  it('PNG и WebP — в PNG, чтобы не потерять прозрачность', () => {
    expect(cropOutputType('image/png')).toBe('image/png')
    expect(cropOutputType('image/webp')).toBe('image/png')
  })

  it('неизвестный тип — PNG', () => {
    expect(cropOutputType('')).toBe('image/png')
  })
})
