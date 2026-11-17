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
    questions: [{ text: 'Столица Франции?', imageUrl: null, options: [{ text: 'Париж', imageUrl: null }, { text: 'Рим', imageUrl: null }], selectCount: 1 }],
  },
}

const MATCHING = {
  type: 'matching' as const,
  matching: { title: 'Животные', showAnswers: false, version: 'v1', timer: { mode: 'none' as const }, definitions: ['мяукает', 'лает'], terms: ['пёс', 'кот'] },
}

let wrapper: VueWrapper | undefined

async function mountPage(route = `/play/${TOKEN}`) {
  wrapper = await mountSuspended(PlayPage, { props: { token: TOKEN }, route })
  await flushPromises()
  return wrapper
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

describe('PlayPage: превью', () => {
  it('?preview=1 на языке по умолчанию: без редиректа, задание загружается, пометка превью видна', async () => {
    vi.mocked(playApi.get).mockResolvedValue(QUIZ)

    const page = await mountPage(`/play/${TOKEN}?preview=1`)

    expect(navigateToMock).not.toHaveBeenCalled()
    expect(playApi.get).toHaveBeenCalledTimes(1)
    expect(page.find('.quiz-play__preview-note').exists()).toBe(true)
    expect(page.find('h1').text()).toBe('Столица Франции?')
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
    expect(playApi.get).toHaveBeenCalledTimes(1)

    await page.find('.play-question__option').trigger('click')
    await page.find('.play-question__action').trigger('click')
    await flushPromises()
    expect(page.find('.play-result__again').exists()).toBe(true)

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

    await page.find('.play-question__option').trigger('click')
    await page.find('.play-question__action').trigger('click')
    await flushPromises()
    expect(page.find('[role="alert"]').text()).toBe('Задание изменилось, начните заново')

    vi.mocked(playApi.get).mockResolvedValue(QUIZ)
    await page.find('.quiz-play__button').trigger('click')
    await flushPromises()

    expect(playApi.get).toHaveBeenCalledTimes(2)
    expect(page.find('h1').text()).toBe('Столица Франции?')
  })
})
