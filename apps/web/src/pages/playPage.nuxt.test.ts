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

const TOKEN = 'abcdefghijklmnopqrstuv'

const QUIZ = {
  type: 'quiz' as const,
  quiz: {
    title: 'Столицы',
    showAnswers: false,
    timer: { mode: 'none' as const },
    version: 'v1',
    introTheme: 'nataskium-night' as const,
    questions: [{ text: 'Столица Франции?', imageUrl: null, options: [{ text: 'Париж', imageUrl: null }, { text: 'Рим', imageUrl: null }], selectCount: 1 }],
  },
}

const MATCHING = {
  type: 'matching' as const,
  matching: { title: 'Животные', showAnswers: false, version: 'v1', introTheme: 'nataskium-night' as const, timer: { mode: 'none' as const }, definitions: ['мяукает', 'лает'], terms: ['пёс', 'кот'] },
}

const TRUE_FALSE = {
  type: 'truefalse' as const,
  trueFalse: { title: 'Факты', showAnswers: false, version: 'v1', introTheme: 'nataskium-night' as const, timer: { mode: 'none' as const }, statements: ['Земля круглая', 'Солнце холодное'] },
}

let wrapper: VueWrapper

async function mountPage(token = TOKEN, route = `/play/${token}`) {
  wrapper = await mountSuspended(PlayPage, { props: { token }, route })
  await flushPromises()
}

// Тема интро по умолчанию играет анимацию; тесты страницы проверяют игру, поэтому интро выключено через reduced motion
function skipIntroAnimation() {
  const realMatchMedia = window.matchMedia.bind(window)
  vi.spyOn(window, 'matchMedia').mockImplementation((query) =>
    query.includes('prefers-reduced-motion') ? ({ matches: true, media: query } as MediaQueryList) : realMatchMedia(query),
  )
}

// Перед загруженным заданием — стартовый экран интро; игра монтируется после «Начать»
async function pressStart() {
  skipIntroAnimation()
  await wrapper.get('.intro-player__start-button').trigger('click')
  await flushPromises()
}

beforeEach(() => {
  vi.resetAllMocks()
  // Язык браузера совпадает с языком сайта в тестах: без перехода на другой адрес
  vi.spyOn(window.navigator, 'languages', 'get').mockReturnValue(['ru-RU'])
})

afterEach(() => {
  wrapper.unmount()
  vi.restoreAllMocks()
})

describe('PlayPage: диспетчер по типу задания', () => {
  it('викторина: один запрос GET, вопрос показан из уже полученного ответа', async () => {
    vi.mocked(playApi.get).mockResolvedValue(QUIZ)
    await mountPage()
    await pressStart()

    expect(playApi.get).toHaveBeenCalledTimes(1)
    expect(playApi.get).toHaveBeenCalledWith(TOKEN)
    expect(wrapper.find('h1').text()).toBe('Столица Франции?')
    expect(wrapper.find('.play-page').exists()).toBe(false)
  })

  it('сопоставление: показывается игра сопоставления, викторина — нет, GET один', async () => {
    vi.mocked(playApi.get).mockResolvedValue(MATCHING)
    await mountPage()
    await pressStart()

    expect(playApi.get).toHaveBeenCalledTimes(1)
    expect(wrapper.find('.matching-play').exists()).toBe(true)
    expect(wrapper.find('.quiz-play').exists()).toBe(false)
  })

  it('да/нет: показывается игра да/нет, остальные — нет, GET один', async () => {
    vi.mocked(playApi.get).mockResolvedValue(TRUE_FALSE)
    await mountPage()
    await pressStart()

    expect(playApi.get).toHaveBeenCalledTimes(1)
    expect(wrapper.find('.true-false-play').exists()).toBe(true)
    expect(wrapper.find('.quiz-play').exists()).toBe(false)
    expect(wrapper.find('.matching-play').exists()).toBe(false)
  })

  it('404 при загрузке: «не найдено» от QuizPlay', async () => {
    vi.mocked(playApi.get).mockRejectedValue(new ApiError(404))
    await mountPage()

    expect(wrapper.find('[role="alert"]').text()).toBe('Задание не найдено или удалено')
  })

  it('сбой сети: QuizPlay показывает «повторить», повтор загружает задание', async () => {
    vi.mocked(playApi.get).mockRejectedValue(new TypeError('Failed to fetch'))
    await mountPage()
    expect(wrapper.find('.quiz-play__button').exists()).toBe(true)

    vi.mocked(playApi.get).mockResolvedValue(QUIZ)
    await wrapper.find('.quiz-play__button').trigger('click')
    await flushPromises()

    expect(wrapper.find('h1').text()).toBe('Столица Франции?')
  })

  it('невалидный токен: «не найдено» без запроса', async () => {
    await mountPage('../auth/me')

    expect(playApi.get).not.toHaveBeenCalled()
    expect(wrapper.find('[role="alert"]').text()).toBe('Задание не найдено или удалено')
  })

  it('язык браузера другой: переход на адрес этого языка до загрузки, задание не запрашивается', async () => {
    vi.spyOn(window.navigator, 'languages', 'get').mockReturnValue(['de-DE'])
    await mountPage()

    expect(navigateToMock).toHaveBeenCalledTimes(1)
    expect(navigateToMock.mock.calls[0]?.[0]).toMatch(/^\/de\//)
    expect(navigateToMock.mock.calls[0]?.[1]).toEqual({ replace: true })
    expect(playApi.get).not.toHaveBeenCalled()
  })

  it('язык выбран переключателем (переход внутри сайта): язык браузера его не перебивает', async () => {
    vi.spyOn(window.navigator, 'languages', 'get').mockReturnValue(['de-DE'])
    const state = window.history.state as Record<string, unknown> | null
    window.history.replaceState({ ...state, back: '/' }, '')
    try {
      vi.mocked(playApi.get).mockResolvedValue(QUIZ)
      await mountPage()

      expect(navigateToMock).not.toHaveBeenCalled()
      expect(playApi.get).toHaveBeenCalledWith(TOKEN)
    } finally {
      window.history.replaceState({ ...state, back: null }, '')
    }
  })

  it('превью: при переходе на другой язык ?preview=1 сохраняется', async () => {
    vi.spyOn(window.navigator, 'languages', 'get').mockReturnValue(['fr-FR'])
    await mountPage(TOKEN, `/play/${TOKEN}?preview=1`)

    expect(navigateToMock.mock.calls[0]?.[0]).toMatch(/^\/fr\/.*\?preview=1$/)
  })
})
