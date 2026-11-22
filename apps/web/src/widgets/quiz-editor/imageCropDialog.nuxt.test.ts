import { mountSuspended } from '@nuxt/test-utils/runtime'
import { flushPromises } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import ImageCropDialog from './components/ImageCropDialog.vue'
import { OPTION_IMAGE_ASPECT, QUESTION_IMAGE_ASPECT, renderCrop } from './imageCrop'

// В happy-dom нет canvas: сама отрисовка подменена, расчёт рамки — настоящий
vi.mock('./imageCrop', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./imageCrop')>()),
  renderCrop: vi.fn(),
}))

const SOURCE_URL = 'blob:qa-source'
// Квадрат 1000×1000: рамка 16:9 при zoom 1 — 1000×562.5, двигается только по вертикали
const NATURAL_SIZE = 1000

const mounted: { unmount: () => void }[] = []
const decode = vi.fn<() => Promise<void>>()

function imageFile(type = 'image/png'): File {
  return new File([new Uint8Array(3)], 'qa.png', { type })
}

async function mountDialog(file = imageFile(), aspect = QUESTION_IMAGE_ASPECT) {
  const wrapper = await mountSuspended(ImageCropDialog, { props: { file, aspect }, attachTo: document.body })
  mounted.push(wrapper)
  await flushPromises()
  return wrapper
}

type Wrapper = Awaited<ReturnType<typeof mountDialog>>

const buttonByText = (wrapper: Wrapper, text: string) => wrapper.findAll('button').find((button) => button.text() === text)!
const frame = (wrapper: Wrapper) => wrapper.get('.image-crop__frame')
const imageStyle = (wrapper: Wrapper) => (wrapper.get('.image-crop__img').element as HTMLElement).style
const percent = (value: string) => Number.parseFloat(value)

beforeEach(() => {
  vi.mocked(renderCrop).mockReset()
  vi.spyOn(URL, 'createObjectURL').mockReturnValue(SOURCE_URL)
  vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined)
  decode.mockReset().mockResolvedValue(undefined)
  vi.spyOn(HTMLImageElement.prototype, 'decode').mockImplementation(decode)
  vi.spyOn(HTMLImageElement.prototype, 'naturalWidth', 'get').mockReturnValue(NATURAL_SIZE)
  vi.spyOn(HTMLImageElement.prototype, 'naturalHeight', 'get').mockReturnValue(NATURAL_SIZE)
})

afterEach(() => {
  for (const wrapper of mounted.splice(0)) wrapper.unmount()
  vi.restoreAllMocks()
})

describe('ImageCropDialog: показ', () => {
  it('открыт модально, заголовок, подпись, три кнопки; рамка с пропорцией и подписью для скринридера', async () => {
    const wrapper = await mountDialog()
    expect((wrapper.get('dialog').element as HTMLDialogElement).open).toBe(true)
    expect(wrapper.get('.app-dialog__title').text()).toBe('Обрезать картинку')
    expect(wrapper.get('.image-crop__caption').text()).toBe('Так увидят ученики')
    expect(wrapper.findAll('.app-dialog__actions button').map((button) => button.text())).toEqual(['Готово', 'Не обрезать', 'Отмена'])
    expect(frame(wrapper).attributes('aria-label')).toContain('Область обрезки')
    expect(frame(wrapper).attributes('tabindex')).toBe('0')
    expect(Number.parseFloat((frame(wrapper).element as HTMLElement).style.aspectRatio)).toBeCloseTo(QUESTION_IMAGE_ASPECT)
  })

  it('картинка из исходного файла; при zoom 1 рамка во всю ширину и по центру', async () => {
    const wrapper = await mountDialog()
    expect(URL.createObjectURL).toHaveBeenCalledOnce()
    expect(wrapper.get('.image-crop__img').attributes('src')).toBe(SOURCE_URL)
    const style = imageStyle(wrapper)
    expect(percent(style.width)).toBeCloseTo(100)
    expect(percent(style.height)).toBeCloseTo((NATURAL_SIZE / 562.5) * 100)
    expect(percent(style.left)).toBeCloseTo(0)
    expect(percent(style.top)).toBeCloseTo((-218.75 / 562.5) * 100)
  })

  it('пока картинка не открылась — «Готово» и ползунок неактивны, «Не обрезать» и «Отмена» доступны', async () => {
    decode.mockReturnValue(new Promise(() => {}))
    const wrapper = await mountDialog()
    expect(wrapper.find('.image-crop__img').exists()).toBe(false)
    expect(buttonByText(wrapper, 'Готово').attributes('disabled')).toBeDefined()
    expect(wrapper.get('.image-crop__range').attributes('disabled')).toBeDefined()
    expect(buttonByText(wrapper, 'Не обрезать').attributes('disabled')).toBeUndefined()
    expect(buttonByText(wrapper, 'Отмена').attributes('disabled')).toBeUndefined()
  })

  it('файл не открылся как картинка — failed', async () => {
    decode.mockRejectedValue(new Error('broken'))
    const wrapper = await mountDialog()
    expect(wrapper.emitted('failed')).toHaveLength(1)
  })

  it('при закрытии адрес файла освобождается', async () => {
    const wrapper = await mountDialog()
    wrapper.unmount()
    mounted.pop()
    expect(URL.revokeObjectURL).toHaveBeenCalledWith(SOURCE_URL)
  })
})

describe('ImageCropDialog: кнопки', () => {
  it('«Готово» — обрезанный файл с тем же именем; рамка передаётся в отрисовку', async () => {
    vi.mocked(renderCrop).mockResolvedValue(new Blob(['cropped']))
    const wrapper = await mountDialog(imageFile('image/jpeg'))

    await buttonByText(wrapper, 'Готово').trigger('click')
    await flushPromises()

    const [image, rect, type] = vi.mocked(renderCrop).mock.calls[0]!
    expect(image).toBeInstanceOf(HTMLImageElement)
    expect(rect.width).toBeCloseTo(1000)
    expect(rect.height).toBeCloseTo(562.5)
    expect(type).toBe('image/jpeg')
    const [file] = wrapper.emitted<[File]>('done')![0]!
    expect(file.name).toBe('qa.png')
    expect(file.type).toBe('image/jpeg')
    expect(await file.text()).toBe('cropped')
  })

  it('«Готово» для PNG и WebP — PNG', async () => {
    vi.mocked(renderCrop).mockResolvedValue(new Blob(['cropped']))
    const wrapper = await mountDialog(imageFile('image/webp'))
    await buttonByText(wrapper, 'Готово').trigger('click')
    await flushPromises()
    expect(vi.mocked(renderCrop).mock.calls[0]![2]).toBe('image/png')
    expect(wrapper.emitted<[File]>('done')![0]![0].type).toBe('image/png')
  })

  it('во время отрисовки кнопки неактивны: второй «Готово» не отправляет второй файл', async () => {
    vi.mocked(renderCrop).mockReturnValue(new Promise(() => {}))
    const wrapper = await mountDialog()
    await buttonByText(wrapper, 'Готово').trigger('click')
    expect(buttonByText(wrapper, 'Готово').attributes('disabled')).toBeDefined()
    expect(buttonByText(wrapper, 'Не обрезать').attributes('disabled')).toBeDefined()
    expect(buttonByText(wrapper, 'Отмена').attributes('disabled')).toBeDefined()
    await buttonByText(wrapper, 'Готово').trigger('click')
    expect(renderCrop).toHaveBeenCalledOnce()
  })

  it('отрисовка не удалась — failed, файла нет', async () => {
    vi.mocked(renderCrop).mockRejectedValue(new Error('Canvas 2D is not available'))
    const wrapper = await mountDialog()
    await buttonByText(wrapper, 'Готово').trigger('click')
    await flushPromises()
    expect(wrapper.emitted('failed')).toHaveLength(1)
    expect(wrapper.emitted('done')).toBeUndefined()
  })

  it('«Не обрезать» — исходный файл без отрисовки', async () => {
    const file = imageFile()
    const wrapper = await mountDialog(file)
    await buttonByText(wrapper, 'Не обрезать').trigger('click')
    expect(wrapper.emitted<[File]>('done')![0]![0]).toBe(file)
    expect(renderCrop).not.toHaveBeenCalled()
  })

  it('«Отмена» — cancel без файла', async () => {
    const wrapper = await mountDialog()
    await buttonByText(wrapper, 'Отмена').trigger('click')
    expect(wrapper.emitted('cancel')).toHaveLength(1)
    expect(wrapper.emitted('done')).toBeUndefined()
  })

  it('Esc (событие cancel у <dialog>) — как «Отмена»', async () => {
    const wrapper = await mountDialog()
    await wrapper.get('dialog').trigger('cancel')
    expect(wrapper.emitted('cancel')).toHaveLength(1)
    expect(wrapper.emitted('done')).toBeUndefined()
  })
})

describe('ImageCropDialog: клавиатура и масштаб', () => {
  it('стрелки двигают картинку на шаг, рамка не выходит за край картинки', async () => {
    const wrapper = await mountDialog()
    const startTop = percent(imageStyle(wrapper).top)

    await frame(wrapper).trigger('keydown', { key: 'ArrowDown' })
    expect(percent(imageStyle(wrapper).top)).toBeGreaterThan(startTop)
    await frame(wrapper).trigger('keydown', { key: 'ArrowUp' })
    expect(percent(imageStyle(wrapper).top)).toBeCloseTo(startTop)

    for (let step = 0; step < 30; step++) await frame(wrapper).trigger('keydown', { key: 'ArrowDown' })
    expect(percent(imageStyle(wrapper).top)).toBeCloseTo(0)
    for (let step = 0; step < 60; step++) await frame(wrapper).trigger('keydown', { key: 'ArrowUp' })
    // Нижний край картинки совпадает с нижним краем рамки
    expect(percent(imageStyle(wrapper).top) + percent(imageStyle(wrapper).height)).toBeCloseTo(100)
  })

  it('при zoom 1 картинка во всю ширину рамки: влево-вправо не двигается', async () => {
    const wrapper = await mountDialog()
    await frame(wrapper).trigger('keydown', { key: 'ArrowLeft' })
    await frame(wrapper).trigger('keydown', { key: 'ArrowRight' })
    await frame(wrapper).trigger('keydown', { key: 'ArrowRight' })
    expect(percent(imageStyle(wrapper).left)).toBeCloseTo(0)
  })

  it('+ и = увеличивают, − уменьшает; масштаб не выходит за 1…3', async () => {
    const wrapper = await mountDialog()
    const range = () => wrapper.get<HTMLInputElement>('.image-crop__range').element

    await frame(wrapper).trigger('keydown', { key: '+' })
    expect(Number(range().value)).toBeCloseTo(1.1)
    await frame(wrapper).trigger('keydown', { key: '=' })
    expect(Number(range().value)).toBeCloseTo(1.2)
    await frame(wrapper).trigger('keydown', { key: '-' })
    await frame(wrapper).trigger('keydown', { key: '-' })
    await frame(wrapper).trigger('keydown', { key: '-' })
    expect(Number(range().value)).toBe(1)
    for (let step = 0; step < 40; step++) await frame(wrapper).trigger('keydown', { key: '+' })
    expect(Number(range().value)).toBe(3)
  })

  it('клавиши рамки не прокручивают страницу, остальные не перехватываются', async () => {
    const wrapper = await mountDialog()
    const arrow = new KeyboardEvent('keydown', { key: 'ArrowDown', cancelable: true })
    frame(wrapper).element.dispatchEvent(arrow)
    expect(arrow.defaultPrevented).toBe(true)
    const tab = new KeyboardEvent('keydown', { key: 'Tab', cancelable: true })
    frame(wrapper).element.dispatchEvent(tab)
    expect(tab.defaultPrevented).toBe(false)
  })

  it('ползунок масштаба уменьшает рамку: картинка в рамке крупнее, после сдвига рамка в пределах', async () => {
    vi.mocked(renderCrop).mockResolvedValue(new Blob(['cropped']))
    const wrapper = await mountDialog(imageFile(), OPTION_IMAGE_ASPECT)
    expect(percent(imageStyle(wrapper).width)).toBeCloseTo(100)

    await wrapper.get('.image-crop__range').setValue('2')
    expect(percent(imageStyle(wrapper).width)).toBeCloseTo(200)
    for (let step = 0; step < 30; step++) await frame(wrapper).trigger('keydown', { key: 'ArrowRight' })
    expect(percent(imageStyle(wrapper).left)).toBeCloseTo(0)

    await buttonByText(wrapper, 'Готово').trigger('click')
    await flushPromises()
    expect(vi.mocked(renderCrop).mock.calls[0]![1]).toEqual({ x: 0, y: 250, width: 500, height: 500 })
  })
})
