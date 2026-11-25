import type { IntroThemeKey } from '@nataskium/shared/schemas'
import { mockNuxtImport, mountSuspended } from '@nuxt/test-utils/runtime'
import { flushPromises } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { restoreSession, useAuthStore } from '@/features/auth'
import { PlayPanel } from '@/widgets/play-panel'

const { navigateToMock } = vi.hoisted(() => ({ navigateToMock: vi.fn() }))
mockNuxtImport('navigateTo', () => navigateToMock)

// Проверка сессии подменена: панель проверяется для гостя и для учителя без запросов
vi.mock('@/features/auth', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/features/auth')>()),
  restoreSession: vi.fn(),
}))

const TOKEN = 'abcdefghijklmnopqrstuv'
const SOURCE = { kind: 'share', token: TOKEN } as const
const TEACHER = { id: 't1', email: 'qa-anna@example.test', displayName: 'Анна', hasPassword: true, hasGoogle: false }
const mounted: { unmount: () => void }[] = []

async function mountPanel(introTheme: IntroThemeKey = 'nataskium-night') {
  const wrapper = await mountSuspended(PlayPanel, { props: { title: 'Столицы', source: SOURCE, introTheme }, attachTo: document.body })
  mounted.push(wrapper)
  await flushPromises()
  return wrapper
}

async function mountLibraryPanel(route: string) {
  const wrapper = await mountSuspended(PlayPanel, {
    props: { title: 'Столицы', source: { kind: 'library', number: 12 }, introTheme: 'nataskium-night' },
    attachTo: document.body,
    route,
  })
  mounted.push(wrapper)
  await flushPromises()
  return wrapper
}

type Wrapper = Awaited<ReturnType<typeof mountPanel>>

const gear = (wrapper: Wrapper) => wrapper.get('[aria-label="Настройки"]')

beforeEach(() => {
  navigateToMock.mockReset()
  vi.mocked(restoreSession).mockResolvedValue(undefined)
})

afterEach(() => {
  for (const wrapper of mounted.splice(0)) wrapper.unmount()
  useAuthStore().clearSession()
  vi.restoreAllMocks()
})

describe('PlayPanel: «Настройки»', () => {
  it('кнопка-шестерёнка: подпись в aria-label и title, видимого текста нет, иконка скрыта от скринридера', async () => {
    const wrapper = await mountPanel()
    const button = gear(wrapper)
    expect(button.attributes('title')).toBe('Настройки')
    expect(button.text()).toBe('')
    expect(button.get('svg').attributes('aria-hidden')).toBe('true')
  })

  it('шестерёнка вне ряда кнопок «Создать задание» / «Скопировать ссылку»', async () => {
    const wrapper = await mountPanel()
    const actions = wrapper.get('.play-panel__actions')
    expect(actions.findAll('button').map((button) => button.text())).toEqual(['Создать задание', 'Скопировать ссылку'])
    expect(actions.find('[aria-label="Настройки"]').exists()).toBe(false)
    expect(wrapper.get('.play-panel__settings').find('[aria-label="Настройки"]').exists()).toBe(true)
  })

  it('открывает и закрывает меню; aria-expanded и aria-controls отражают состояние', async () => {
    const wrapper = await mountPanel()
    expect(gear(wrapper).attributes('aria-expanded')).toBe('false')
    expect(wrapper.find('#play-panel-settings').exists()).toBe(false)

    await gear(wrapper).trigger('click')
    expect(gear(wrapper).attributes('aria-expanded')).toBe('true')
    expect(gear(wrapper).attributes('aria-controls')).toBe('play-panel-settings')
    const items = wrapper.get('#play-panel-settings').findAll('button')
    expect(items.map((item) => item.text())).toEqual(['Внедрить скоро', 'QR-код скоро'])
    for (const item of items) expect(item.attributes('disabled')).toBeDefined()

    await gear(wrapper).trigger('click')
    expect(wrapper.find('#play-panel-settings').exists()).toBe(false)
    expect(gear(wrapper).attributes('aria-expanded')).toBe('false')
  })
})

describe('PlayPanel: визуальный стиль', () => {
  it('по превью на каждый стиль: тон тёмный и светлый, превью скрыто от скринридера, название видно', async () => {
    const wrapper = await mountPanel()
    const styles = wrapper.findAll('.play-panel__style')
    expect(styles).toHaveLength(2)
    expect(styles.map((style) => style.get('.play-panel__style-name').text())).toEqual(['Nataskium: ночь', 'Nataskium: день'])
    const previews = styles.map((style) => style.get('.intro-theme-preview'))
    expect(previews[0]!.classes()).toContain('intro-theme-preview--dark')
    expect(previews[1]!.classes()).toContain('intro-theme-preview--light')
    for (const preview of previews) expect(preview.attributes('aria-hidden')).toBe('true')
    expect(wrapper.find('.play-panel__swatch').exists()).toBe(false)
  })

  it('превью — кусочек экрана вопроса: карточка, три точки окна, вопрос и четыре ответа', async () => {
    const wrapper = await mountPanel()
    const preview = wrapper.get('.intro-theme-preview')
    expect(preview.find('.intro-theme-preview__pcb').exists()).toBe(true)
    expect(preview.findAll('.intro-theme-preview__dots i')).toHaveLength(3)
    expect(preview.find('.intro-theme-preview__question').exists()).toBe(true)
    expect(preview.findAll('.intro-theme-preview__options i')).toHaveLength(4)
  })

  it('выбранный стиль отмечен, выбор другого обновляет модель', async () => {
    const wrapper = await mountPanel('nataskium-day')
    const radios = wrapper.findAll<HTMLInputElement>('.play-panel__style-input')
    expect(radios.map((radio) => radio.element.checked)).toEqual([false, true])
    expect(wrapper.get('.play-panel__legend').text()).toBe('Визуальный стиль')

    await radios[0]!.setValue(true)

    expect(wrapper.emitted('update:introTheme')?.[0]).toEqual(['nataskium-night'])
  })
})

describe('PlayPanel: ссылка и создание', () => {
  it('«Скопировать ссылку» копирует ссылку задания и сообщает об этом', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    vi.spyOn(navigator, 'clipboard', 'get').mockReturnValue({ writeText } as unknown as Clipboard)
    const wrapper = await mountPanel()

    await wrapper.findAll('.play-panel__actions button')[1]!.trigger('click')
    await flushPromises()

    expect(writeText).toHaveBeenCalledWith(`${window.location.origin}/play/${TOKEN}`)
    expect(wrapper.get('.play-panel__status').text()).toBe('Ссылка скопирована')
  })

  it('библиотека: копируется адрес задания библиотеки на текущем языке, без shareToken', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    vi.spyOn(navigator, 'clipboard', 'get').mockReturnValue({ writeText } as unknown as Clipboard)
    const wrapper = await mountLibraryPanel('/en/library/quiz/12-old')

    await wrapper.findAll('.play-panel__actions button')[1]!.trigger('click')
    await flushPromises()

    expect(writeText).toHaveBeenCalledTimes(1)
    expect(decodeURIComponent(String(writeText.mock.calls[0]?.[0]))).toBe(`${window.location.origin}/en/library/quiz/12-столицы`)
    expect(wrapper.get('.play-panel__status').text()).toBe('Link copied')
  })

  it('библиотека на языке по умолчанию: адрес без языкового префикса', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    vi.spyOn(navigator, 'clipboard', 'get').mockReturnValue({ writeText } as unknown as Clipboard)
    const wrapper = await mountLibraryPanel('/library/quiz/12-old')

    await wrapper.findAll('.play-panel__actions button')[1]!.trigger('click')
    await flushPromises()

    expect(decodeURIComponent(String(writeText.mock.calls[0]?.[0]))).toBe(`${window.location.origin}/library/quiz/12-столицы`)
  })

  it('копирование не удалось — сообщение об ошибке', async () => {
    vi.spyOn(navigator, 'clipboard', 'get').mockReturnValue({ writeText: vi.fn().mockRejectedValue(new Error('denied')) } as unknown as Clipboard)
    const wrapper = await mountPanel()

    await wrapper.findAll('.play-panel__actions button')[1]!.trigger('click')
    await flushPromises()

    expect(wrapper.get('.play-panel__status').text()).toBe('Не получилось скопировать ссылку')
  })

  it('гость: «Создать задание» открывает окно входа, перехода нет', async () => {
    const wrapper = await mountPanel()
    await wrapper.get('.play-panel__button--create').trigger('click')
    await flushPromises()
    expect(navigateToMock).not.toHaveBeenCalled()
    expect((wrapper.get('dialog').element as HTMLDialogElement).open).toBe(true)
    expect(wrapper.get('.app-dialog__title').text()).toBe('Войдите, чтобы создать задание')
  })

  it('учитель: «Создать задание» ведёт к созданию', async () => {
    useAuthStore().setSession({ accessToken: 'access-1', teacher: TEACHER })
    const wrapper = await mountPanel()
    await wrapper.get('.play-panel__button--create').trigger('click')
    await flushPromises()
    expect(navigateToMock).toHaveBeenCalledOnce()
  })
})
