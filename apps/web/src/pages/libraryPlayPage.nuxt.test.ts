import { mockNuxtImport, mountSuspended } from '@nuxt/test-utils/runtime'
import { flushPromises, type VueWrapper } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { playApi } from '@/entities/quiz'
import { ApiError } from '@/shared'
import PlayPage from './PlayPage.vue'

const { navigateToMock } = vi.hoisted(() => ({ navigateToMock: vi.fn() }))
mockNuxtImport('navigateTo', () => navigateToMock)

vi.mock('@/entities/quiz', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/entities/quiz')>()),
  playApi: { get: vi.fn(), check: vi.fn(), finish: vi.fn() },
}))

const NOT_FOUND_TEXT = 'Задание не найдено или удалено'
const LIBRARY_SOURCE = { kind: 'library', number: 12 } as const

const QUIZ = {
  type: 'quiz' as const,
  quiz: {
    title: 'Capitals',
    showAnswers: false,
    timer: { mode: 'none' as const },
    version: 'v1',
    introTheme: 'nataskium-night' as const,
    questions: [{ text: 'Столица Франции?', imageUrl: null, options: [{ text: 'Париж', imageUrl: null }, { text: 'Рим', imageUrl: null }], selectCount: 1 }],
  },
}

const MATCHING = {
  type: 'matching' as const,
  matching: { title: 'Capitals', showAnswers: false, version: 'v1', introTheme: 'nataskium-night' as const, timer: { mode: 'none' as const }, definitions: ['мяукает', 'лает'], terms: ['пёс', 'кот'] },
}

const TRUE_FALSE = {
  type: 'truefalse' as const,
  trueFalse: { title: 'Capitals', showAnswers: false, version: 'v1', introTheme: 'nataskium-night' as const, timer: { mode: 'none' as const }, statements: ['Земля круглая'] },
}

let wrapper: VueWrapper | undefined

async function mountLibrary(slug = '12-capitals', route = `/library/quiz/${slug}`) {
  wrapper = await mountSuspended(PlayPage, { props: { address: { kind: 'library', slug } }, route })
  await flushPromises()
  return wrapper
}

function skipIntroAnimation() {
  const realMatchMedia = window.matchMedia.bind(window)
  vi.spyOn(window, 'matchMedia').mockImplementation((query) =>
    query.includes('prefers-reduced-motion') ? ({ matches: true, media: query } as MediaQueryList) : realMatchMedia(query),
  )
}

async function pressStart(page: VueWrapper) {
  skipIntroAnimation()
  await page.get('.intro-player__start-button').trigger('click')
  await flushPromises()
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

describe('PlayPage: задание библиотеки', () => {
  it('номер из slug: один GET по библиотечному источнику, игра после «Начать»', async () => {
    vi.mocked(playApi.get).mockResolvedValue(QUIZ)
    const page = await mountLibrary()

    expect(playApi.get).toHaveBeenCalledTimes(1)
    expect(playApi.get).toHaveBeenCalledWith(LIBRARY_SOURCE)
    expect(page.find('.intro-player__title').text()).toBe('Capitals')
    await pressStart(page)
    expect(page.find('h1').text()).toBe('Столица Франции?')
  })

  it.each([
    ['matching', MATCHING, '.matching-play'],
    ['truefalse', TRUE_FALSE, '.true-false-play'],
  ] as const)('%s: показывается своя игра', async (_type, body, selector) => {
    vi.mocked(playApi.get).mockResolvedValue(body)
    const page = await mountLibrary()
    await pressStart(page)

    expect(page.find(selector).exists()).toBe(true)
    expect(page.find('.quiz-play').exists()).toBe(false)
  })

  it.each(['abc', '0', '012-x', '12abc', '2147483648-x'])('мусорный slug «%s»: «не найдено» в проигрывателе без запроса', async (slug) => {
    const page = await mountLibrary(slug)

    expect(playApi.get).not.toHaveBeenCalled()
    expect(page.get('[role="alert"]').text()).toBe(NOT_FOUND_TEXT)
    expect(page.find('.intro-player__start-button').exists()).toBe(false)
  })

  it('404 от API: «не найдено» в проигрывателе', async () => {
    vi.mocked(playApi.get).mockRejectedValue(new ApiError(404))
    const page = await mountLibrary()

    expect(page.get('[role="alert"]').text()).toBe(NOT_FOUND_TEXT)
    expect(navigateToMock).not.toHaveBeenCalled()
  })

  it('500: «повторить», повтор загружает задание по тому же номеру', async () => {
    vi.mocked(playApi.get).mockRejectedValueOnce(new ApiError(500))
    const page = await mountLibrary()
    expect(playApi.get).toHaveBeenCalledTimes(1)
    expect(page.find('.play-page__button').exists()).toBe(true)

    vi.mocked(playApi.get).mockResolvedValueOnce(QUIZ)
    await page.get('.play-page__button').trigger('click')
    await flushPromises()
    await pressStart(page)

    expect(playApi.get).toHaveBeenLastCalledWith(LIBRARY_SOURCE)
    expect(page.find('h1').text()).toBe('Столица Франции?')
  })

  it('язык браузера другой: язык сайта не переключается', async () => {
    vi.spyOn(window.navigator, 'languages', 'get').mockReturnValue(['en-US'])
    vi.mocked(playApi.get).mockResolvedValue(QUIZ)
    await mountLibrary()

    expect(navigateToMock).not.toHaveBeenCalled()
    expect(playApi.get).toHaveBeenCalledTimes(1)
  })

  it('устаревший slug: адрес заменяется на slug из названия, с query и hash, GET один', async () => {
    vi.mocked(playApi.get).mockResolvedValue(QUIZ)
    await mountLibrary('12-old', '/library/quiz/12-old?from=mail#top')

    expect(navigateToMock).toHaveBeenCalledTimes(1)
    expect(navigateToMock.mock.calls[0]?.[0]).toEqual({ path: '/library/quiz/12-capitals', query: { from: 'mail' }, hash: '#top' })
    expect(navigateToMock.mock.calls[0]?.[1]).toEqual({ replace: true })
    expect(playApi.get).toHaveBeenCalledTimes(1)
  })

  it('на английском замена slug сохраняет префикс языка', async () => {
    vi.mocked(playApi.get).mockResolvedValue(QUIZ)
    await mountLibrary('12', '/en/library/quiz/12')

    expect(navigateToMock.mock.calls[0]?.[0]).toMatchObject({ path: '/en/library/quiz/12-capitals' })
  })

  it('кириллический slug совпадает с названием: адрес не заменяется', async () => {
    vi.mocked(playApi.get).mockResolvedValue({ ...QUIZ, quiz: { ...QUIZ.quiz, title: 'Столицы Европы' } })
    await mountLibrary('12-столицы-европы')

    expect(navigateToMock).not.toHaveBeenCalled()
  })

  it('панели предпросмотра нет', async () => {
    vi.mocked(playApi.get).mockResolvedValue(QUIZ)
    const page = await mountLibrary()

    expect(page.find('.play-page__preview').exists()).toBe(false)
    expect(page.text()).not.toContain('Так видит задание ученик')
  })
})
