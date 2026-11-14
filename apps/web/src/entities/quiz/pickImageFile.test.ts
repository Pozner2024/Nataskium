import { MAX_IMAGE_UPLOAD_BYTES } from '@nataskium/shared/schemas'
import { describe, expect, it } from 'vitest'
import { pickImageFile, validateImageFile } from './pickImageFile'

function file(type: string, size = 1, name = 'qa'): File {
  return new File([new Uint8Array(size)], name, { type })
}

// В node нет DataTransfer и FileList: подставляем объекты той же формы
function fileList(files: File[]): FileList {
  return Object.assign([...files], { item: (index: number) => files[index] ?? null }) as unknown as FileList
}

function dataTransfer(files: File[]): DataTransfer {
  return { files: fileList(files) } as unknown as DataTransfer
}

describe('pickImageFile', () => {
  it('берёт картинку из буфера обмена / перетаскивания', () => {
    const image = file('image/png')

    expect(pickImageFile(dataTransfer([image]))).toBe(image)
  })

  it('игнорирует текст и берёт первую картинку', () => {
    const text = file('text/plain')
    const first = file('image/jpeg')
    const second = file('image/webp')

    expect(pickImageFile(dataTransfer([text, first, second]))).toBe(first)
  })

  it('только текст (без файлов или текстовый файл) — null', () => {
    expect(pickImageFile(dataTransfer([]))).toBeNull()
    expect(pickImageFile(dataTransfer([file('text/plain')]))).toBeNull()
  })

  it('FileList из <input type="file">', () => {
    const image = file('image/webp')

    expect(pickImageFile(fileList([image]))).toBe(image)
  })

  it('null (нет clipboardData или files) — null', () => {
    expect(pickImageFile(null)).toBeNull()
  })
})

describe('validateImageFile', () => {
  it.each(['image/jpeg', 'image/png', 'image/webp'])('%s в пределах лимита — ok', (type) => {
    expect(validateImageFile(file(type, MAX_IMAGE_UPLOAD_BYTES))).toBe('ok')
  })

  it('15 МБ + 1 байт — tooLarge', () => {
    expect(validateImageFile(file('image/png', MAX_IMAGE_UPLOAD_BYTES + 1))).toBe('tooLarge')
  })

  it.each(['image/heic', 'image/heif', 'image/gif', 'image/svg+xml', 'text/plain', ''])('%j — notImage', (type) => {
    expect(validateImageFile(file(type))).toBe('notImage')
  })

  it('большой файл не того типа — notImage', () => {
    expect(validateImageFile(file('image/gif', MAX_IMAGE_UPLOAD_BYTES + 1))).toBe('notImage')
  })
})
