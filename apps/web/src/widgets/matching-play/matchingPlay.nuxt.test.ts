import { mountSuspended } from '@nuxt/test-utils/runtime'
import { flushPromises } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { matchingPlayApi } from '@/entities/matching'
import { playApi } from '@/entities/quiz'
import { ApiError } from '@/shared'
import MatchingPlay from './MatchingPlay.vue'
import { useMatchingPlayStore } from './store'

vi.mock('@/entities/matching', () => ({ matchingPlayApi: { finish: vi.fn() } }))
vi.mock('@/entities/quiz', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/entities/quiz')>()),
  playApi: { get: vi.fn() },
}))

const finish = vi.mocked(matchingPlayApi.finish)
const get = vi.mocked(playApi.get)

const TOKEN = 'abcdefghijklmnopqrstuv'
const RESULT = { percent: 50, grade: '3', correctCount: 1, partialCount: 0, totalCount: 2 }

function initial(showAnswers = true) {
  return {
    type: 'matching' as const,
    matching: {
      title: 'Животные',
      showAnswers,
      version: 'v1',
      introTheme: 'nataskium-night' as const,
      timer: { mode: 'none' as const },
      definitions: ['Мяукает', 'Лает'],
      terms: ['собака', 'кошка'],
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
const live = (wrapper: Wrapper) => wrapper.get('.matching-board [aria-live="polite"]').text()

beforeEach(() => {
  vi.resetAllMocks()
})

afterEach(() => {
  for (const wrapper of mounted.splice(0)) wrapper.unmount()
})

describe('MatchingPlay: доска', () => {
  it('определения в порядке учителя с номерами, слова — в лотке в порядке сервера, «Проверить» неактивна', async () => {
    const wrapper = await mountPlay()

    expect(wrapper.findAll('.definition-card__text').map((item) => item.text())).toEqual(['Определение 1: Мяукает', 'Определение 2: Лает'])
    expect(wrapper.findAll('.matching-board__pool .term-chip').map((chip) => chip.text())).toEqual(['собака', 'кошка'])
    expect(wrapper.get('.matching-board__check').attributes('disabled')).toBeDefined()
    expect(wrapper.get('.matching-board__progress').text()).toBe('0 / 2')
  })

  it('заголовок «Слова» остаётся в разметке и подписывает список слов (виден только скринридеру)', async () => {
    const wrapper = await mountPlay()

    const title = wrapper.get('.matching-board__tray-title')
    expect(title.text()).toBe('Слова')
    expect(wrapper.get('.matching-board__pool').attributes('aria-labelledby')).toBe(title.attributes('id'))
  })

  it('фокус на заголовке задания при старте', async () => {
    const wrapper = await mountPlay()

    expect(document.activeElement).toBe(wrapper.get('.matching-board__task').element)
  })
})

describe('MatchingPlay: тап-путь', () => {
  it('тап по слову выбирает его (aria-pressed), объявление и подписи зон меняются', async () => {
    const wrapper = await mountPlay()

    await poolChip(wrapper, 'кошка').trigger('click')

    expect(poolChip(wrapper, 'кошка').attributes('aria-pressed')).toBe('true')
    expect(live(wrapper)).toBe('Выбрано слово «кошка». Выберите определение.')
    expect(card(wrapper, 0).get('.definition-card__drop').attributes('aria-label')).toBe('Определение 1: Мяукает. Поставить слово «кошка»')
    expect(card(wrapper, 0).text()).toContain('Нажмите, чтобы поставить «кошка»')
  })

  it('повторный тап по выбранному слову и Escape снимают выбор', async () => {
    const wrapper = await mountPlay()

    await poolChip(wrapper, 'кошка').trigger('click')
    await poolChip(wrapper, 'кошка').trigger('click')
    expect(poolChip(wrapper, 'кошка').attributes('aria-pressed')).toBe('false')
    expect(live(wrapper)).toBe('Выбор снят.')

    await poolChip(wrapper, 'собака').trigger('click')
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    await flushPromises()
    expect(poolChip(wrapper, 'собака').attributes('aria-pressed')).toBe('false')
  })

  it('тап по слову, затем по определению ставит пару; фокус — на следующее пустое определение', async () => {
    const wrapper = await mountPlay()

    await poolChip(wrapper, 'кошка').trigger('click')
    await card(wrapper, 0).get('.definition-card__drop').trigger('click')
    await flushPromises()

    expect(card(wrapper, 0).get('.term-chip').text()).toBe('кошка')
    expect(wrapper.findAll('.matching-board__pool .term-chip').map((chip) => chip.text())).toEqual(['собака'])
    expect(live(wrapper)).toBe('Слово «кошка» поставлено к определению 1. Осталось 1.')
    expect(document.activeElement).toBe(card(wrapper, 1).get('.definition-card__drop').element)
    expect(wrapper.get('.matching-board__progress').text()).toBe('1 / 2')
  })

  it('тап по пустому определению без выбранного слова ничего не ставит', async () => {
    const wrapper = await mountPlay()

    await card(wrapper, 0).get('.definition-card__drop').trigger('click')

    expect(useMatchingPlayStore().placements).toEqual([null, null])
  })

  it('последнее слово: «Проверить» появляется в лотке и получает фокус', async () => {
    const wrapper = await mountPlay()

    await poolChip(wrapper, 'кошка').trigger('click')
    await card(wrapper, 0).get('.definition-card__drop').trigger('click')
    await poolChip(wrapper, 'собака').trigger('click')
    await card(wrapper, 1).get('.definition-card__drop').trigger('click')
    await flushPromises()

    const check = wrapper.get('.matching-board__check')
    expect(check.text()).toBe('Проверить')
    expect(document.activeElement).toBe(check.element)
    expect(live(wrapper)).toBe('Все слова на местах. Можно проверять.')
  })

  it('слово в клетке выбрано → «Вернуть слово» возвращает его к словам, объявление «возвращено»', async () => {
    const wrapper = await mountPlay()
    await poolChip(wrapper, 'кошка').trigger('click')
    await card(wrapper, 0).get('.definition-card__drop').trigger('click')
    await card(wrapper, 0).get('.term-chip').trigger('click')

    const remove = wrapper.get('.matching-board__return')
    expect(remove.text()).toBe('Вернуть слово «кошка» к словам')
    await remove.trigger('click')
    await flushPromises()

    expect(card(wrapper, 0).find('.term-chip').exists()).toBe(false)
    expect(wrapper.findAll('.matching-board__pool .term-chip')).toHaveLength(2)
    expect(live(wrapper)).toBe('Слово «кошка» возвращено к словам.')
  })

  it('Delete на слове в клетке возвращает его к словам', async () => {
    const wrapper = await mountPlay()
    await poolChip(wrapper, 'кошка').trigger('click')
    await card(wrapper, 0).get('.definition-card__drop').trigger('click')

    await card(wrapper, 0).get('.term-chip').trigger('keydown', { key: 'Delete' })
    await flushPromises()

    expect(card(wrapper, 0).find('.term-chip').exists()).toBe(false)
    expect(wrapper.findAll('.matching-board__pool .term-chip')).toHaveLength(2)
    expect(live(wrapper)).toBe('Слово «кошка» возвращено к словам.')
  })

  it('выбранное слово тапом по поставленному — замена, старое возвращается в лоток', async () => {
    const wrapper = await mountPlay()
    await poolChip(wrapper, 'кошка').trigger('click')
    await card(wrapper, 0).get('.definition-card__drop').trigger('click')

    await poolChip(wrapper, 'собака').trigger('click')
    const placed = card(wrapper, 0).get('.term-chip')
    expect(placed.attributes('aria-label')).toBe('Определение 1: Мяукает. Заменить «кошка» на «собака»')
    await placed.trigger('click')
    await flushPromises()

    expect(useMatchingPlayStore().placements).toEqual([0, null])
    expect(wrapper.findAll('.matching-board__pool .term-chip').map((chip) => chip.text())).toEqual(['кошка'])
    expect(live(wrapper)).toBe('Слово «собака» поставлено к определению 1, «кошка» вернулось к словам.')
  })

  it('поставленное слово можно выбрать и перенести на другое определение', async () => {
    const wrapper = await mountPlay()
    await poolChip(wrapper, 'кошка').trigger('click')
    await card(wrapper, 0).get('.definition-card__drop').trigger('click')

    await card(wrapper, 0).get('.term-chip').trigger('click')
    expect(card(wrapper, 0).get('.term-chip').attributes('aria-pressed')).toBe('true')
    await card(wrapper, 1).get('.definition-card__drop').trigger('click')

    expect(useMatchingPlayStore().placements).toEqual([null, 1])
  })
})

describe('MatchingPlay: перетаскивание', () => {
  function rect(top: number, bottom: number) {
    return { top, bottom, left: 0, right: 360, width: 360, height: bottom - top, x: 0, y: top, toJSON: () => ({}) }
  }

  function pointer(type: string, x: number, y: number) {
    return new PointerEvent(type, { clientX: x, clientY: y, pointerId: 1, pointerType: 'touch', bubbles: true })
  }

  async function layout(wrapper: Wrapper) {
    vi.spyOn(wrapper.get('.matching-board__tray').element, 'getBoundingClientRect').mockReturnValue(rect(56, 186) as DOMRect)
    vi.spyOn(card(wrapper, 0).element, 'getBoundingClientRect').mockReturnValue(rect(200, 320) as DOMRect)
    vi.spyOn(card(wrapper, 1).element, 'getBoundingClientRect').mockReturnValue(rect(334, 454) as DOMRect)
  }

  async function dragTo(wrapper: Wrapper, from: Element, y: number) {
    from.dispatchEvent(pointer('pointerdown', 100, 120))
    window.dispatchEvent(pointer('pointermove', 100, 140))
    window.dispatchEvent(pointer('pointermove', 100, y))
    await flushPromises()
    window.dispatchEvent(pointer('pointerup', 100, y))
    await flushPromises()
  }

  beforeEach(() => {
    vi.spyOn(window, 'requestAnimationFrame').mockReturnValue(0)
  })

  it('перетаскивание и тап дают одинаковое состояние', async () => {
    const byDrag = await mountPlay()
    await layout(byDrag)
    await dragTo(byDrag, poolChip(byDrag, 'кошка').element, 250)
    const dragged = [...useMatchingPlayStore().placements]
    byDrag.unmount()
    mounted.splice(0)

    const byTap = await mountPlay()
    await poolChip(byTap, 'кошка').trigger('click')
    await card(byTap, 0).get('.definition-card__drop').trigger('click')

    expect(dragged).toEqual([1, null])
    expect(useMatchingPlayStore().placements).toEqual(dragged)
  })

  it('слово в руке подсвечивает цели и рисует копию, место в лотке — пунктир', async () => {
    const wrapper = await mountPlay()
    await layout(wrapper)

    poolChip(wrapper, 'кошка').element.dispatchEvent(pointer('pointerdown', 100, 120))
    window.dispatchEvent(pointer('pointermove', 100, 260))
    await flushPromises()

    expect(wrapper.find('.term-chip--lifted').exists()).toBe(true)
    expect(poolChip(wrapper, 'кошка').classes()).toContain('term-chip--ghost')
    expect(card(wrapper, 0).classes()).toContain('definition-card--over')
    expect(card(wrapper, 1).classes()).toContain('definition-card--armed')
    expect(live(wrapper)).toBe('Взято слово «кошка».')

    window.dispatchEvent(pointer('pointercancel', 100, 260))
    await flushPromises()
    expect(wrapper.find('.term-chip--lifted').exists()).toBe(false)
    expect(useMatchingPlayStore().placements).toEqual([null, null])
  })

  it('сдвиг меньше порога — это тап, а не перетаскивание', async () => {
    const wrapper = await mountPlay()
    await layout(wrapper)

    poolChip(wrapper, 'кошка').element.dispatchEvent(pointer('pointerdown', 100, 120))
    window.dispatchEvent(pointer('pointermove', 103, 124))
    window.dispatchEvent(pointer('pointerup', 103, 124))
    await poolChip(wrapper, 'кошка').trigger('click')

    expect(wrapper.find('.term-chip--lifted').exists()).toBe(false)
    expect(useMatchingPlayStore().picked).toBe(1)
  })

  it('отпустить мимо — слово остаётся на месте; click после перетаскивания не выбирает слово', async () => {
    const wrapper = await mountPlay()
    await layout(wrapper)

    const chip = poolChip(wrapper, 'кошка').element
    chip.dispatchEvent(pointer('pointerdown', 100, 120))
    window.dispatchEvent(pointer('pointermove', 100, 700))
    await flushPromises()
    // Браузер шлёт click сразу за pointerup, в той же задаче
    window.dispatchEvent(pointer('pointerup', 100, 700))
    chip.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await flushPromises()

    expect(useMatchingPlayStore().placements).toEqual([null, null])
    expect(useMatchingPlayStore().picked).toBeNull()
  })

  it('на занятое — замена; поднять на лоток — вернуть', async () => {
    const wrapper = await mountPlay()
    await layout(wrapper)
    await dragTo(wrapper, poolChip(wrapper, 'кошка').element, 250)
    await dragTo(wrapper, poolChip(wrapper, 'собака').element, 250)

    expect(useMatchingPlayStore().placements).toEqual([0, null])
    expect(useMatchingPlayStore().pool).toEqual([1])

    await dragTo(wrapper, card(wrapper, 0).get('.term-chip').element, 100)
    expect(useMatchingPlayStore().placements).toEqual([null, null])
    expect(live(wrapper)).toBe('Слово «собака» возвращено к словам.')
  })
})

describe('MatchingPlay: итог', () => {
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

  it('процент, оценка, «Верно X из Y»; фокус на заголовке', async () => {
    const wrapper = await playToResult(initial(false))

    expect(wrapper.get('.matching-result__title').text()).toBe('Вы прошли задание «Животные»')
    expect(wrapper.get('.matching-result__percent').text()).toBe('50%')
    expect(wrapper.get('.matching-result__grade').text()).toBe('Оценка: 3')
    expect(wrapper.get('.matching-result__stat').text()).toBe('Верно: 1 из 2')
    expect(document.activeElement).toBe(wrapper.get('.matching-result__title').element)
  })

  it('без showAnswers — нет списка пар, есть пояснение', async () => {
    const wrapper = await playToResult(initial(false))

    expect(wrapper.find('.review-row').exists()).toBe(false)
    expect(wrapper.get('.matching-result__hidden').text()).toBe('В этом задании правильные пары не показываются.')
  })

  it('с review — «Ваши пары»: верно, неверно с «Правильно: …» по индексу определения', async () => {
    const review = [{ correct: true, term: 'кошка' }, { correct: false, term: 'собака' }]
    const wrapper = await playToResult(initial(true), { result: RESULT, review })

    const rows = wrapper.findAll('.review-row')
    expect(rows).toHaveLength(2)
    expect(rows[0]!.classes()).toContain('review-row--correct')
    expect(rows[0]!.text()).toContain('Ваш ответ: кошка')
    expect(rows[0]!.find('.review-row__right').exists()).toBe(false)
    expect(rows[1]!.classes()).toContain('review-row--wrong')
    expect(rows[1]!.text()).toContain('Неверно')
    expect(rows[1]!.get('.review-row__right').text()).toBe('Правильно: собака')
  })

  it('время вышло: пустые пары — «Нет ответа», примечание про пары', async () => {
    finish.mockResolvedValue({ result: { ...RESULT, percent: 0, correctCount: 0 }, review: [{ correct: false, term: 'кошка' }, { correct: false, term: 'собака' }] })
    const wrapper = await mountPlay()

    await useMatchingPlayStore().expire()
    await flushPromises()

    expect(finish).toHaveBeenCalledWith(TOKEN, { version: 'v1', answers: [null, null] })
    expect(wrapper.get('.matching-result__note').text()).toBe('Время вышло: пустые пары засчитаны как неверные')
    const rows = wrapper.findAll('.review-row')
    expect(rows[0]!.classes()).toContain('review-row--empty')
    expect(rows[0]!.text()).toContain('Слово не поставлено')
    expect(rows[0]!.text()).toContain('Нет ответа')
  })

  it('«Пройти ещё раз» — новый GET и снова доска', async () => {
    const wrapper = await playToResult()
    get.mockResolvedValue(initial())

    await wrapper.get('.matching-result__again').trigger('click')
    await flushPromises()

    expect(get).toHaveBeenCalledWith(TOKEN)
    expect(wrapper.find('.matching-board').exists()).toBe(true)
  })
})

describe('MatchingPlay: ошибки', () => {
  async function failCheck(error: unknown) {
    finish.mockRejectedValue(error)
    const wrapper = await mountPlay()
    const store = useMatchingPlayStore()
    store.place(1, 0)
    store.place(0, 1)
    await store.check()
    await flushPromises()
    return wrapper
  }

  it('404 — «не найдено»', async () => {
    const wrapper = await failCheck(new ApiError(404))
    expect(wrapper.get('[role="alert"]').text()).toBe('Задание не найдено или удалено')
  })

  it('409 — «задание изменено» и кнопка перезапуска', async () => {
    const wrapper = await failCheck(new ApiError(409))
    expect(wrapper.find('.matching-play__button').exists()).toBe(true)
  })

  it('сетевая ошибка — «повторить» повторяет проверку', async () => {
    const wrapper = await failCheck(new Error('network'))
    finish.mockResolvedValue({ result: RESULT })

    await wrapper.get('.matching-play__button').trigger('click')
    await flushPromises()

    expect(finish).toHaveBeenCalledTimes(2)
    expect(wrapper.find('.matching-result').exists()).toBe(true)
  })
})
