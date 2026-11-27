// Раскладка сцены фирменной темы от размера контейнера (порт layout.js из прототипа hyperframes-lab/work/brand-intro).
// Константы заданы в пикселях эталонного кадра: 1920 по ширине для горизонтального контейнера, 1080 — для вертикального,
// и масштабируются под реальный размер, поэтому на 1920×1080 и 1080×2000 значения совпадают с прототипом
const LANDSCAPE_REFERENCE_WIDTH = 1920
const PORTRAIT_REFERENCE_WIDTH = 1080

// viewBox логотипа из AppLogo.vue
const LOGO_VIEW = { x: 145, y: 170, width: 1880, height: 357 }
const HEAD_CENTER_VIEW = { x: 592, y: 400 }
const HEAD_WIDTH_VIEW = 243

const LOGO_MAX_WIDTH = 1200
const LOGO_SIDE_GAP = 90
const HERO_HEAD_WIDTH = 310

// Робот уезжает в конец слова, но на узком кадре правый край головы остаётся в кадре с отступом
const ROBOT_MAX_OFFSET_VIEW = 1340
const ROBOT_HALF_WIDTH_VIEW = 125
const ROBOT_EDGE_GAP = 40

const ROUTE_DROP = 120
const ROUTE_TOP_GAP = 16
const ROUTE_OVERSHOOT = 20

// Центры букв в координатах viewBox: в прототипе их давал getBBox(), в приложении он не нужен (и его нет в happy-dom)
export const LETTER_CENTERS_VIEW = {
  n: 304.5,
  t: 811.4,
  a: 992,
  s: 1165.3,
  k: 1346,
  i: 1474.5,
  u: 1611.4,
  m: 1861.8,
} as const

export type Point = { x: number; y: number }

export type IntroLayout = {
  center: Point
  logo: { left: number; top: number; width: number; height: number; scale: number }
  headRest: Point
  heroScale: number
  heroShift: Point
  robotFarOffset: number
}

export function introLayout(width: number, height: number): IntroLayout {
  const unit = width >= height ? width / LANDSCAPE_REFERENCE_WIDTH : width / PORTRAIT_REFERENCE_WIDTH
  const logoWidth = Math.min(LOGO_MAX_WIDTH * unit, width - 2 * LOGO_SIDE_GAP * unit)
  const scale = logoWidth / LOGO_VIEW.width
  const logoHeight = LOGO_VIEW.height * scale
  const logo = { left: (width - logoWidth) / 2, top: (height - logoHeight) / 2, width: logoWidth, height: logoHeight, scale }
  const center = { x: width / 2, y: height / 2 }
  const headRest = {
    x: logo.left + (HEAD_CENTER_VIEW.x - LOGO_VIEW.x) * scale,
    y: logo.top + (HEAD_CENTER_VIEW.y - LOGO_VIEW.y) * scale,
  }
  const robotReach = (width - ROBOT_EDGE_GAP * unit - headRest.x) / scale - ROBOT_HALF_WIDTH_VIEW

  return {
    center,
    logo,
    headRest,
    heroScale: (HERO_HEAD_WIDTH * unit) / (HEAD_WIDTH_VIEW * scale),
    heroShift: { x: center.x - headRest.x, y: center.y - headRest.y },
    robotFarOffset: Math.max(0, Math.min(ROBOT_MAX_OFFSET_VIEW, robotReach)),
  }
}

// Доля пути робота (0 — дальняя точка, 1 — своё место), на которой его правый край проезжает середину буквы
export function letterRevealProgress(letterCenterView: number, robotFarOffset: number): number {
  if (robotFarOffset === 0) return 1
  const passOffset = letterCenterView - ROBOT_HALF_WIDTH_VIEW - HEAD_CENTER_VIEW.x
  return Math.min(1, Math.max(0, 1 - passOffset / robotFarOffset))
}

// Фоновые дорожки во время игры: по одной у каждого угла, с поворотом под 45°, как сигнал заставки.
// Доли — от размера контейнера: дорожки держатся у краёв, где виден узор платы, и почти не заходят под карточку
const AMBIENT_DROP = 70
const AMBIENT_OVERSHOOT = 20

export function ambientRoutes(width: number, height: number): Point[][] {
  const unit = width >= height ? width / LANDSCAPE_REFERENCE_WIDTH : width / PORTRAIT_REFERENCE_WIDTH
  const drop = AMBIENT_DROP * unit
  const out = AMBIENT_OVERSHOOT * unit
  const topRight = { y: height * 0.1, turn: width * 0.8, end: width * 0.7 }
  const bottomLeft = { y: height * 0.9, turn: width * 0.18, end: width * 0.28 }
  const left = { x: width * 0.05, turn: height * 0.32, end: height * 0.42 }
  const right = { x: width * 0.95, turn: height * 0.68, end: height * 0.58 }
  // Порядок — очередь импульсов: первый бежит по нижней левой дорожке
  return [
    [{ x: -out, y: bottomLeft.y }, { x: bottomLeft.turn, y: bottomLeft.y }, { x: bottomLeft.turn + drop, y: bottomLeft.y - drop }, { x: bottomLeft.end + drop, y: bottomLeft.y - drop }],
    [{ x: right.x, y: height + out }, { x: right.x, y: right.turn }, { x: right.x - drop, y: right.turn - drop }, { x: right.x - drop, y: right.end - drop }],
    [{ x: width + out, y: topRight.y }, { x: topRight.turn, y: topRight.y }, { x: topRight.turn - drop, y: topRight.y + drop }, { x: topRight.end - drop, y: topRight.y + drop }],
    [{ x: left.x, y: -out }, { x: left.x, y: left.turn }, { x: left.x + drop, y: left.turn + drop }, { x: left.x + drop, y: left.end + drop }],
  ]
}

// Дорожка сигнала с поворотом под 45°: из-за правого края кадра к точке входа в рамку карточки.
// Горизонталь не поднимается выше ceiling (низ шапки вопроса) и верха контейнера, спуск при этом короче
export function signalRoute(width: number, height: number, entry: Point, ceiling = 0): Point[] {
  const unit = width >= height ? width / LANDSCAPE_REFERENCE_WIDTH : width / PORTRAIT_REFERENCE_WIDTH
  const top = Math.max(ceiling, 0) + ROUTE_TOP_GAP * unit
  const drop = Math.max(0, Math.min(ROUTE_DROP * unit, entry.y - top))
  return [
    { x: width + ROUTE_OVERSHOOT * unit, y: entry.y - drop },
    { x: entry.x + drop, y: entry.y - drop },
    entry,
  ]
}
