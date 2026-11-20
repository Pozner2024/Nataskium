import { mountSuspended } from '@nuxt/test-utils/runtime'
import { flushPromises, type VueWrapper } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { playApi } from '@/entities/quiz'
import { ApiError } from '@/shared'
import PlayPage from './PlayPage.vue'

vi.mock('@/entities/quiz', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/entities/quiz')>()),
  playApi: { get: vi.fn(), check: vi.fn(), finish: vi.fn() },
}))

const TOKEN = 'abcdefghijklmnopqrstuv'

const QUIZ = {
  type: 'quiz' as const,
  quiz: {
    title: 'Столицы',
    showAnswers: false,
    timer: { mode: 'none' as const },
    version: 'v1',
    questions: [{ text: 'Столица Франции?', imageUrl: null, options: [{ text: 'Париж', imageUrl: null }, { text: 'Рим', imageUrl: null }], selectCount: 1 }],
  },
}

const MATCHING = {
  type: 'matching' as const,
  matching: { title: 'Животные', showAnswers: false, version: 'v1', timer: { mode: 'none' as const }, definitions: ['мяукает', 'лает'], terms: ['пёс', 'кот'] },
}

let wrapper: VueWrapper | undefined

async function mountPage(token = TOKEN, route = `/play/${token}`) {
  wrapper = await mountSuspended(PlayPage, { props: { token }, route })
  await flushPromises()
  return wrapper
}

beforeEach(() => {
  vi.resetAllMocks()
  vi.spyOn(window.navigator, 'languages', 'get').mockReturnValue(['ru-RU'])
})

afterEach(() => {
  wrapper?.unmount()
  wrapper = undefined
  vi.restoreAllMocks()
})

describe('PlayPage: «Пропустить» у ученика', () => {
  it('викторина: на стартовом экране есть «Пропустить заставку», он ведёт сразу к вопросу', async () => {
    vi.mocked(playApi.get).mockResolvedValue(QUIZ)
    const page = await mountPage()

    expect(page.get('.intro-player__skip').text()).toContain('Пропустить заставку')
    expect(page.find('h1').text()).toBe('Столицы')

    await page.get('.intro-player__skip').trigger('click')
    await flushPromises()

    expect(page.find('.intro-player__start').exists()).toBe(false)
    expect(page.find('h1').text()).toBe('Столица Франции?')
  })

  it('сопоставление: «Пропустить заставку» ведёт сразу к игре', async () => {
    vi.mocked(playApi.get).mockResolvedValue(MATCHING)
    const page = await mountPage()

    await page.get('.intro-player__skip').trigger('click')
    await flushPromises()

    expect(page.find('.matching-play').exists()).toBe(true)
  })

  it('кнопка есть и без ?preview=1', async () => {
    vi.mocked(playApi.get).mockResolvedValue(QUIZ)
    const page = await mountPage()

    expect(page.find('.play-page__preview').exists()).toBe(false)
    expect(page.find('.intro-player__skip').exists()).toBe(true)
  })
})

describe('PlayPage: загрузка и ошибки без интро', () => {
  it('загрузка: «Загрузка…» без стартового экрана и «Пропустить»', async () => {
    vi.mocked(playApi.get).mockReturnValue(new Promise(() => undefined))
    const page = await mountPage()

    expect(page.find('.play-page__message').exists()).toBe(true)
    expect(page.find('.intro-player__start-button').exists()).toBe(false)
    expect(page.find('.intro-player__skip').exists()).toBe(false)
  })

  it('404: сообщение сразу, без стартового экрана и «Пропустить»', async () => {
    vi.mocked(playApi.get).mockRejectedValue(new ApiError(404))
    const page = await mountPage()

    expect(page.get('[role="alert"]').text()).toBe('Задание не найдено или удалено')
    expect(page.find('.intro-player__start-button').exists()).toBe(false)
    expect(page.find('.intro-player__skip').exists()).toBe(false)
  })

  it('сбой сети: «повторить» сразу, без интро', async () => {
    vi.mocked(playApi.get).mockRejectedValue(new TypeError('Failed to fetch'))
    const page = await mountPage()

    expect(page.find('.quiz-play__button').exists()).toBe(true)
    expect(page.find('.intro-player__start-button').exists()).toBe(false)
    expect(page.find('.intro-player__skip').exists()).toBe(false)
  })

  it('невалидный токен: без запроса и без интро', async () => {
    const page = await mountPage('../auth/me')

    expect(playApi.get).not.toHaveBeenCalled()
    expect(page.find('.intro-player__start-button').exists()).toBe(false)
  })
})

describe('PlayPage: превью без панели', () => {
  it('?preview=1: панели с «Назад» и «Предпросмотр» нет ни на стартовом экране, ни после «Начать»', async () => {
    vi.mocked(playApi.get).mockResolvedValue(QUIZ)
    const page = await mountPage(TOKEN, `/play/${TOKEN}?preview=1`)

    expect(page.find('.play-page__back').exists()).toBe(false)
    expect(page.find('.intro-player__toolbar').exists()).toBe(false)

    await page.get('.intro-player__start-button').trigger('click')
    await flushPromises()
    expect(page.find('.play-page__back').exists()).toBe(false)
    expect(page.find('.intro-player__toolbar').exists()).toBe(false)
  })

  it('без ?preview=1 кнопки «Назад» нет', async () => {
    vi.mocked(playApi.get).mockResolvedValue(QUIZ)
    const page = await mountPage()

    expect(page.find('.play-page__back').exists()).toBe(false)
    expect(page.find('.intro-player__toolbar').exists()).toBe(false)
  })
})
