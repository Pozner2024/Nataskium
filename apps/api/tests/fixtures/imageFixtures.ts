// Картинки для тестов загрузки строятся программно: в репозитории нет бинарных файлов, в сеть не ходим
import { crc32, deflateSync } from 'node:zlib'
import sharp from 'sharp'

const BRAND_BLUE = '#4573F4'
const RGB_CHANNELS = 3
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
const PNG_IHDR_SIZE = 13
const PNG_BIT_DEPTH_1 = 1
const PNG_COLOR_GRAYSCALE = 0
const PNG_ROW_FILTER_BYTES = 1
const BITS_PER_BYTE = 8
const MAX_DEFLATE_LEVEL = 9
const UINT32_BYTES = 4
const EXIF_ROTATE_90 = 6
// Заметные строки: по ним проверяем, что EXIF и GPS не попали в результат
export const EXIF_MARKER = 'QA-EXIF-MARKER'

function solid(width: number, height: number) {
  return sharp({ create: { width, height, channels: RGB_CHANNELS, background: BRAND_BLUE } })
}

// JPEG с EXIF (автор, копирайт) и GPS
export async function jpegWithExif(width: number, height: number): Promise<Buffer> {
  return solid(width, height)
    .jpeg()
    .withExif({
      IFD0: { Copyright: EXIF_MARKER, Artist: EXIF_MARKER },
      IFD3: { GPSLatitudeRef: 'N', GPSLatitude: '55/1 45/1 0/1' },
    })
    .toBuffer()
}

// Снимок «на боку»: EXIF Orientation = 6 (повернуть на 90°)
export async function rotatedJpeg(width: number, height: number): Promise<Buffer> {
  return solid(width, height).jpeg().withMetadata({ orientation: EXIF_ROTATE_90 }).toBuffer()
}

export async function png(width: number, height: number): Promise<Buffer> {
  return solid(width, height).png().toBuffer()
}

export async function webp(width: number, height: number): Promise<Buffer> {
  return solid(width, height).webp().toBuffer()
}

// Форматы, которые sharp декодирует, но мы не принимаем
export async function gif(): Promise<Buffer> {
  return solid(10, 10).gif().toBuffer()
}

export async function avif(): Promise<Buffer> {
  return solid(10, 10).avif().toBuffer()
}

export async function tiff(): Promise<Buffer> {
  return solid(10, 10).tiff().toBuffer()
}

export const SVG = Buffer.from(
  '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><script>alert(1)</script><rect width="10" height="10"/></svg>',
)

export const HTML = Buffer.from('<!doctype html><html><body><script>alert(document.cookie)</script></body></html>')

// Сигнатура JPEG, дальше HTML: «картинка» только по первым байтам
export const JPEG_MAGIC_WITH_HTML = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff]), HTML])

export async function truncatedJpeg(): Promise<Buffer> {
  const full = await solid(800, 600).jpeg().toBuffer()
  return full.subarray(0, Math.floor(full.length / 2))
}

function pngChunk(type: string, data: Buffer): Buffer {
  const length = Buffer.alloc(UINT32_BYTES)
  length.writeUInt32BE(data.length)
  const typeAndData = Buffer.concat([Buffer.from(type, 'ascii'), data])
  const crc = Buffer.alloc(UINT32_BYTES)
  crc.writeUInt32BE(crc32(typeAndData))
  return Buffer.concat([length, typeAndData, crc])
}

// «Пиксельная бомба»: корректный PNG 20000×20000 (400 Мпикс), 1 бит на пиксель, нули сжаты — файл ~50 КБ.
// Сжимаются ~50 МБ нулей; 400-мегапиксельного буфера в памяти нет
export function pixelBombPng(width = 20_000, height = 20_000): Buffer {
  const header = Buffer.alloc(PNG_IHDR_SIZE)
  header.writeUInt32BE(width, 0)
  header.writeUInt32BE(height, UINT32_BYTES)
  header[8] = PNG_BIT_DEPTH_1
  header[9] = PNG_COLOR_GRAYSCALE
  const rowBytes = PNG_ROW_FILTER_BYTES + Math.ceil(width / BITS_PER_BYTE)
  const pixels = deflateSync(Buffer.alloc(height * rowBytes), { level: MAX_DEFLATE_LEVEL })
  return Buffer.concat([PNG_SIGNATURE, pngChunk('IHDR', header), pngChunk('IDAT', pixels), pngChunk('IEND', Buffer.alloc(0))])
}
