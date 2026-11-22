import { mountSuspended } from '@nuxt/test-utils/runtime'
import { flushPromises } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { matchingPlayApi } from '@/entities/matching'
import MatchingPlay from './MatchingPlay.vue'
import { useMatchingPlayStore } from './store'

vi.mock('@/entities/matching', () => ({ matchingPlayApi: { finish: vi.fn() } }))
vi.mock('@/entities/quiz', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/entities/quiz')>()),
  playApi: { get: vi.fn() },
}))

const finish = vi.mocked(matchingPlayApi.finish)

const TOKEN = 'abcdefghijklmnopqrstuv'
const RESULT = { percent: 50, grade: '3', correctCount: 1, partialCount: 0, totalCount: 2 }
const TEN = 10
const LONG_TERM = 'с'.repeat(59)
const LONG_DEFINITION = 'д'.repeat(200)

function initial(overrides: Partial<{ showAnswers: boolean; definitions: string[]; terms: string[] }> = {}) {
  return {
    type: 'matching' as const,
    matching: {
      title: 'Животные',
      showAnswers: overrides.showAnswers ?? true,
      version: 'v1',
      introTheme: 'nataskium-night' as const,
      timer: { mode: 'none' as const },
      definitions: overrides.definitions ?? ['Мяукает', 'Лает'],
      terms: overrides.terms ?? ['собака', 'кошка'],
    },
  }
}

const mounted: { unmount: () => void }[] = []

async function mountPlay(response = initial()) {
  const wrapper = await mountSuspended(MatchingPlay, { props: { token: TOKEN, initial: response }, attachTo: document.body })
  mounted.push(wrapper)
  await flushPromises()
  return wrapper
}

type Wrapper = Awaited<ReturnType<typeof mountPlay>>

const poolChip = (wrapper: Wrapper, text: string) =>
  wrapper.findAll('.matching-board__pool .term-chip').find((chip) => chip.text() === text)!
const card = (wrapper: Wrapper, index: number) => wrapper.findAll('.definition-card')[index]!

beforeEach(() => {
  vi.resetAllMocks()
  vi.spyOn(window, 'requestAnimationFrame').mockReturnValue(0)
})

afterEach(() => {
  vi.restoreAllMocks()
  for (const wrapper of mounted.splice(0)) wrapper.unmount()
})

function rect(top: number, bottom: number): DOMRect {
  return { top, bottom, left: 0, right: 360, width: 360, height: bottom - top, x: 0, y: top, toJSON: () => ({}) } as DOMRect
}

function pointer(type: string, x: number, y: number) {
  return new PointerEvent(type, { clientX: x, clientY: y, pointerId: 1, pointerType: 'touch', bubbles: true })
}

async function layout(wrapper: Wrapper) {
  vi.spyOn(wrapper.get('.matching-board__tray').element, 'getBoundingClientRect').mockReturnValue(rect(56, 186))
  vi.spyOn(card(wrapper, 0).element, 'getBoundingClientRect').mockReturnValue(rect(200, 320))
  vi.spyOn(card(wrapper, 1).element, 'getBoundingClientRect').mockReturnValue(rect(334, 454))
}

describe('MatchingPlay: размеры и «Проверить»', () => {
  it('10 пар: все определения, все 10 слов в лотке, прогресс «0 / 10»', async () => {
    const definitions = Array.from({ length: TEN }, (_, i) => `Определение ${i + 1}`)
    const terms = Array.from({ length: TEN }, (_, i) => `слово ${i + 1}`)
    const wrapper = await mountPlay(initial({ definitions, terms }))

    expect(wrapper.findAll('.definition-card')).toHaveLength(TEN)
    expect(wrapper.findAll('.matching-board__pool .term-chip').map((chip) => chip.text())).toEqual(terms)
    expect(wrapper.get('.matching-board__progress').text()).toBe(`0 / ${TEN}`)
  })

  it('«Проверить» видна сразу и неактивна с «Осталось расставить: N»; после последнего слова — активна', async () => {
    const wrapper = await mountPlay()
    const store = useMatchingPlayStore()

    expect(wrapper.get('.matching-board__check').attributes('disabled')).toBeDefined()
    expect(wrapper.get('.matching-board__tray-count').text()).toBe('Осталось расставить: 2')

    store.place(1, 0)
    await flushPromises()
    expect(wrapper.get('.matching-board__check').attributes('disabled')).toBeDefined()
    expect(wrapper.get('.matching-board__tray-count').text()).toBe('Осталось расставить: 1')

    store.place(0, 1)
    await flushPromises()
    const check = wrapper.get('.matching-board__check')
    expect(check.attributes('disabled')).toBeUndefined()
  })

  it('слово 59 символов и определение 200 символов выводятся целиком', async () => {
    const wrapper = await mountPlay(initial({ definitions: [LONG_DEFINITION, 'Лает'], terms: [LONG_TERM, 'кошка'] }))

    expect(wrapper.findAll('.term-chip').some((chip) => chip.text() === LONG_TERM)).toBe(true)
    expect(wrapper.get('.definition-card__text').text()).toContain(LONG_DEFINITION)
  })
})

describe('MatchingPlay: текст как текст', () => {
  it('HTML-подобные слово и определение выводятся буквально, элементов <b>/<i> внутри доски нет', async () => {
    const wrapper = await mountPlay(initial({ definitions: ['<i>y</i>', 'Лает'], terms: ['<b>x</b>', 'кошка'] }))

    expect(wrapper.findAll('.term-chip').map((chip) => chip.text())).toContain('<b>x</b>')
    expect(wrapper.get('.definition-card__text').text()).toContain('<i>y</i>')
    expect(wrapper.find('.matching-board b').exists()).toBe(false)
    expect(wrapper.find('.matching-board i').exists()).toBe(false)
  })
})

describe('MatchingPlay: итог и источник вердиктов', () => {
  async function playToResult(response = initial(), finishResponse: Awaited<ReturnType<typeof matchingPlayApi.finish>> = { result: RESULT }) {
    finish.mockResolvedValue(finishResponse)
    const wrapper = await mountPlay(response)
    const store = useMatchingPlayStore()
    store.place(1, 0)
    store.place(0, 1)
    await wrapper.vm.$nextTick()
    await wrapper.get('.matching-board__check').trigger('click')
    await flushPromises()
    return wrapper
  }

  it('без showAnswers итог не содержит «Правильно:»', async () => {
    const wrapper = await playToResult(initial({ showAnswers: false }))

    expect(wrapper.text()).not.toContain('Правильно:')
    expect(wrapper.find('.review-row').exists()).toBe(false)
  })

  it('с showAnswers вердикт берётся из review, а не из своей расстановки', async () => {
    // Расстановка верная (кошка → Мяукает), но сервер отметил строку неверной: показываем ответ сервера
    const review = [{ correct: false, term: 'кошка' }, { correct: true, term: 'собака' }]
    const wrapper = await playToResult(initial({ showAnswers: true }), { result: RESULT, review })

    const rows = wrapper.findAll('.review-row')
    expect(rows[0]!.classes()).toContain('review-row--wrong')
    expect(rows[1]!.classes()).toContain('review-row--correct')
  })
})

describe('MatchingPlay: отмена перетаскивания', () => {
  it('Escape во время перетаскивания возвращает слово к словам', async () => {
    const wrapper = await mountPlay()
    await layout(wrapper)
    poolChip(wrapper, 'кошка').element.dispatchEvent(pointer('pointerdown', 100, 120))
    window.dispatchEvent(pointer('pointermove', 100, 260))
    await flushPromises()
    expect(wrapper.find('.term-chip--lifted').exists()).toBe(true)

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    await flushPromises()

    expect(wrapper.find('.term-chip--lifted').exists()).toBe(false)
    expect(useMatchingPlayStore().placements).toEqual([null, null])
    expect(useMatchingPlayStore().pool).toEqual([0, 1])
  })
})
