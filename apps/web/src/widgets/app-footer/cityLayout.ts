// Координаты в процентах полной картинки города 2078×757, из которой нарезаны все слои сцены

type Point = [x: number, y: number]
type Range = [min: number, max: number]

interface Lamp {
  x: number
  y: number
  glowSize: number
}

export const BIG_STARS: Point[] = [
  [29.6, 10.7], [16.9, 17.1], [35.9, 17.7], [55.4, 16.5], [67.9, 20.3], [81.5, 16.2], [64.1, 29.1], [37, 35.1],
  [86.2, 17.3], [9.8, 11.3], [23.5, 5.9], [79.5, 34.7], [72.8, 21.4], [98.1, 4.9], [13.2, 11.2], [40.6, 17.8],
]

export const SMALL_STARS: Point[] = [
  [43.36, 4.36], [14.34, 6.21], [39.36, 9.38], [52.94, 11.23], [69.25, 11.89], [38.21, 12.81], [60.39, 13.74],
  [33.78, 14.93], [63.81, 17.97], [27.43, 19.68], [84.84, 22.32], [73.15, 25.1], [32.24, 29.33], [71.61, 31.31],
]

export const LAMPS: Lamp[] = [
  { x: 3.9, y: 56.5, glowSize: 6 },
  { x: 8.25, y: 71.7, glowSize: 6 },
  { x: 4, y: 78.9, glowSize: 5.5 },
  { x: 10.35, y: 87.1, glowSize: 6.5 },
  { x: 96.25, y: 62.1, glowSize: 6 },
  { x: 96.1, y: 78.5, glowSize: 6 },
  { x: 86.9, y: 87.2, glowSize: 6 },
  { x: 78.6, y: 88.7, glowSize: 5.5 },
]

// Огни под арками моста: по их отражениям в воде вспыхивают блики
export const ARCH_LIGHTS_X = [19.3, 26.5, 33.5, 41.3, 49.6, 57.9, 65.9, 75.6, 83.6]

// Полоса воды под мостом (картинка water.webp)
export const WATER_TOP = 79.26
export const WATER_HEIGHT = 5.284

export const FLASK_NECK_X = 58.3
export const FLASK_NECK_Y: Range = [52, 54]
export const FLASK_BOTTOM_X: Range = [57.2, 59.8]
export const FLASK_BOTTOM_Y: Range = [61, 63]
