import { mockNuxtImport, mountSuspended } from '@nuxt/test-utils/runtime'
import { flushPromises, type VueWrapper } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { playApi } from '@/entities/quiz'
import { ApiError } from '@/shared'
import PlayPage from './PlayPage.vue'

const { navigateToMock, useSeoMetaMock } = vi.hoisted(() => ({
  navigateToMock: vi.fn(),
  useSeoMetaMock: vi.fn<(meta: { robots?: string }) => void>(),
}))
mockNuxtImport('navigateTo', () => navigateToMock)
mockNuxtImport('useSeoMeta', () => useSeoMetaMock)

vi.mock('@/entities/quiz', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/entities/quiz')>()),
  playApi: { get: vi.fn(), check: vi.fn(), finish: vi.fn() },
}))

const TOKEN = 'abcdefghijklmnopqrstuv'
const RESULT = { percent: 100, grade: null, correctCount: 1, partialCount: 0, totalCount: 1 }

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
  trueFalse: {
    title: 'Факты',
    showAnswers: false,
    version: 'v1',
    introTheme: 'nataskium-night' as const,
    timer: { mode: 'none' as const },
    statements: ['Земля круглая', 'Солнце холодное'],
  },
}

let wrapper: VueWrapper | undefined

async function mountPage(route = `/play/${TOKEN}`) {
  wrapper = await mountSuspended(PlayPage, { props: { address: { kind: 'share', token: TOKEN } }, route })
  await flushPromises()
  return wrapper
}

// Тема интро по умолчанию играет анимацию; тесты страницы проверяют игру, поэтому интро выключено через reduced motion
function skipIntroAnimation() {
  const realMatchMedia = window.matchMedia.bind(window)
  vi.spyOn(window, 'matchMedia').mockImplementation((query) =>
    query.includes('prefers-reduced-motion') ? ({ matches: true, media: query } as MediaQueryList) : realMatchMedia(query),
  )
}

// Перед загруженным заданием — стартовый экран интро; игра монтируется после «Начать»
async function pressStart(page: VueWrapper) {
  skipIntroAnimation()
  await page.get('.intro-player__start-button').trigger('click')
  await flushPromises()
}

function lastSeoRobots(): string | undefined {
  return useSeoMetaMock.mock.lastCall?.[0].robots
}

beforeEach(() => {
  vi.resetAllMocks()
  // Язык браузера совпадает с языком сайта: переход на другой адрес не нужен
  vi.spyOn(window.navigator, 'languages', 'get').mockReturnValue(['ru-RU'])
})

afterEach(() => {
  wrapper?.unmount()
  wrapper = undefined
  vi.restoreAllMocks()
})

describe('PlayPage: да/нет', () => {
  it('стартовый экран интро: подписи типа, название и подсказка «да/нет»', async () => {
    vi.mocked(playApi.get).mockResolvedValue(TRUE_FALSE)
    const page = await mountPage()

    expect(page.find('.intro-player__type').text()).toBe('Да/нет')
    expect(page.find('.intro-player__title').text()).toBe('Факты')
    expect(page.find('.intro-player__hint').text()).toBe('Решите, верно ли каждое утверждение')
  })

  it('после «Начать» игра показывает первое утверждение из полученного ответа, GET один', async () => {
    vi.mocked(playApi.get).mockResolvedValue(TRUE_FALSE)
    const page = await mountPage()
    await pressStart(page)

    expect(playApi.get).toHaveBeenCalledTimes(1)
    expect(page.find('.true-false-play').exists()).toBe(true)
    expect(page.find('.quiz-play').exists()).toBe(false)
    expect(page.find('.matching-play').exists()).toBe(false)
    expect(page.find('h1').text()).toBe('Земля круглая')
  })
})

describe('PlayPage: метаданные', () => {
  it('викторина и заглушка сопоставления: страница закрыта от поисковиков', async () => {
    vi.mocked(playApi.get).mockResolvedValue(QUIZ)
    await mountPage()
    expect(lastSeoRobots()).toContain('noindex')

    wrapper?.unmount()
    useSeoMetaMock.mockClear()
    vi.mocked(playApi.get).mockResolvedValue(MATCHING)
    await mountPage()

    expect(lastSeoRobots()).toContain('noindex')
  })
})

describe('PlayPage: повтор задания', () => {
  it('«Пройти ещё раз» после диспетчера загружает задание заново, а не из начального ответа', async () => {
    vi.mocked(playApi.get).mockResolvedValue(QUIZ)
    vi.mocked(playApi.finish).mockResolvedValue({ result: RESULT })
    const page = await mountPage()
    await pressStart(page)
    expect(playApi.get).toHaveBeenCalledTimes(1)

    // Выбор засчитывается сам, итог приходит после автоперехода
    await page.find('.play-question__option').trigger('click')
    await vi.waitFor(() => expect(page.find('.play-result__again').exists()).toBe(true))

    vi.mocked(playApi.get).mockResolvedValue(QUIZ)
    await page.find('.play-result__again').trigger('click')
    await flushPromises()

    expect(playApi.get).toHaveBeenCalledTimes(2)
    expect(page.find('h1').text()).toBe('Столица Франции?')
  })

  it('409 «задание изменено» → «Начать заново» загружает актуальную версию', async () => {
    vi.mocked(playApi.get).mockResolvedValue(QUIZ)
    vi.mocked(playApi.finish).mockRejectedValueOnce(new ApiError(409))
    const page = await mountPage()
    await pressStart(page)

    await page.find('.play-question__option').trigger('click')
    await vi.waitFor(() => expect(page.find('[role="alert"]').exists()).toBe(true))
    expect(page.find('[role="alert"]').text()).toBe('Задание изменилось, начните заново')

    vi.mocked(playApi.get).mockResolvedValue(QUIZ)
    await page.find('.quiz-play__button').trigger('click')
    await flushPromises()

    expect(playApi.get).toHaveBeenCalledTimes(2)
    expect(page.find('h1').text()).toBe('Столица Франции?')
  })
})
