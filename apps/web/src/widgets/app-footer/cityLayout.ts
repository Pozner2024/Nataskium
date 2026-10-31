// Координаты в процентах полной картинки города 2078×757, из которой нарезаны все слои сцены

type Point = [x: number, y: number]
type Range = [min: number, max: number]

interface WindowPatch {
  x: number
  y: number
  width: number
  height: number
  // Цвет стены вокруг окна: заплатка этого цвета «гасит» свет
  wallColor: string
}

interface ArchWindow {
  image: string
  x: number
  y: number
  width: number
  // Окна одной группы — половинки одного окна, гаснут вместе
  group: number
}

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

export const SKYSCRAPER_WINDOWS: WindowPatch[] = [
  { x: 60.35, y: 49.01, width: 0.19, height: 0.92, wallColor: '#0632a1' },
  { x: 42.78, y: 42.01, width: 0.19, height: 1.59, wallColor: '#3c3c8d' },
  { x: 60.15, y: 43.73, width: 0.14, height: 0.79, wallColor: '#032f9a' },
  { x: 85.13, y: 47.69, width: 0.19, height: 0.66, wallColor: '#3b509f' },
  { x: 6.98, y: 29.19, width: 0.29, height: 1.59, wallColor: '#474d8b' },
  { x: 82.15, y: 47.16, width: 0.14, height: 1.85, wallColor: '#023795' },
  { x: 93.89, y: 41.88, width: 0.19, height: 0.53, wallColor: '#31469c' },
  { x: 6.69, y: 33.95, width: 0.29, height: 1.45, wallColor: '#6c528a' },
  { x: 12.22, y: 38.44, width: 0.19, height: 1.19, wallColor: '#7b6292' },
  { x: 60.92, y: 36.59, width: 0.34, height: 1.59, wallColor: '#6f5c84' },
  { x: 14.2, y: 43.99, width: 0.19, height: 0.92, wallColor: '#333f7e' },
  { x: 13.62, y: 49.01, width: 0.24, height: 1.06, wallColor: '#203886' },
  { x: 24.3, y: 44.39, width: 0.14, height: 0.66, wallColor: '#4c4782' },
]

export const ARCH_WINDOWS: ArchWindow[] = [
  { image: 'win-1', x: 93.359, y: 46.367, width: 1.54, group: 1 },
  { image: 'win-2', x: 14.389, y: 48.085, width: 0.914, group: 2 },
  { image: 'win-3', x: 14.1, y: 52.048, width: 1.684, group: 3 },
  { image: 'win-4', x: 42.156, y: 54.954, width: 1.781, group: 4 },
  { image: 'win-5', x: 21.367, y: 55.482, width: 1.155, group: 5 },
  { image: 'win-7', x: 20.308, y: 56.803, width: 1.011, group: 5 },
  { image: 'win-6', x: 26.756, y: 56.407, width: 1.011, group: 6 },
  { image: 'win-8', x: 63.956, y: 58.917, width: 0.77, group: 7 },
  { image: 'win-10', x: 75.602, y: 59.445, width: 1.636, group: 8 },
  { image: 'win-11', x: 72.329, y: 60.502, width: 1.781, group: 9 },
  { image: 'win-12', x: 38.114, y: 61.162, width: 1.54, group: 10 },
]

// Фонари на переднем плане, в кустах по краям сцены
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

// Колба: пузырьки стартуют у дна конуса и поднимаются к горлышку
export const FLASK_NECK_X = 58.3
export const FLASK_NECK_Y: Range = [52, 54]
export const FLASK_BOTTOM_X: Range = [57.2, 59.8]
export const FLASK_BOTTOM_Y: Range = [61, 63]
