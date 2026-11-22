export type ImageSize = { width: number; height: number }
export type CropCenter = { x: number; y: number }
export type CropRect = { x: number; y: number; width: number; height: number }

export const QUESTION_IMAGE_ASPECT = 16 / 9
export const OPTION_IMAGE_ASPECT = 1
export const MIN_CROP_ZOOM = 1
export const MAX_CROP_ZOOM = 3

// Сервер всё равно уменьшает картинку до 1200 px по большей стороне (imageProcessor.ts)
const MAX_OUTPUT_SIDE_PX = 1200
const JPEG_QUALITY = 0.92

// Рамка при zoom = 1 закрывает картинку целиком (как object-fit: cover), zoom уменьшает рамку
function cropSize(image: ImageSize, aspect: number, zoom: number): ImageSize {
  const coverWidth = Math.min(image.width, image.height * aspect)
  return { width: coverWidth / zoom, height: coverWidth / aspect / zoom }
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}

// Центр рамки (доля ширины и высоты картинки) не даёт рамке выйти за края картинки
export function clampCenter(image: ImageSize, aspect: number, zoom: number, center: CropCenter): CropCenter {
  const size = cropSize(image, aspect, zoom)
  const halfX = size.width / 2 / image.width
  const halfY = size.height / 2 / image.height
  return { x: clamp(center.x, halfX, 1 - halfX), y: clamp(center.y, halfY, 1 - halfY) }
}

export function cropRect(image: ImageSize, aspect: number, zoom: number, center: CropCenter): CropRect {
  const size = cropSize(image, aspect, zoom)
  const safe = clampCenter(image, aspect, zoom, center)
  return {
    x: safe.x * image.width - size.width / 2,
    y: safe.y * image.height - size.height / 2,
    width: size.width,
    height: size.height,
  }
}

// JPEG остаётся JPEG; PNG и WebP — в PNG, чтобы не потерять прозрачность. В WebP перекодирует сервер
export function cropOutputType(sourceType: string): string {
  return sourceType === 'image/jpeg' ? 'image/jpeg' : 'image/png'
}

export async function renderCrop(image: HTMLImageElement, rect: CropRect, type: string): Promise<Blob> {
  const scale = Math.min(1, MAX_OUTPUT_SIDE_PX / Math.max(rect.width, rect.height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(rect.width * scale)
  canvas.height = Math.round(rect.height * scale)
  const context = canvas.getContext('2d')
  if (!context) throw new Error('Canvas 2D is not available')
  context.drawImage(image, rect.x, rect.y, rect.width, rect.height, 0, 0, canvas.width, canvas.height)
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, JPEG_QUALITY))
  if (!blob) throw new Error('Could not encode the cropped image')
  return blob
}
