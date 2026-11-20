import { mountSuspended } from '@nuxt/test-utils/runtime'
import { flushPromises } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { playApi } from '@/entities/quiz'
import { trueFalsePlayApi } from '@/entities/true-false'
import { ApiError } from '@/shared'
import TrueFalsePlay from './TrueFalsePlay.vue'
import { ANSWER_ADVANCE_MS, ANSWER_FEEDBACK_MS } from './store'

vi.mock('@/entities/true-false', () => ({ trueFalsePlayApi: { check: vi.fn(), finish: vi.fn() } }))
vi.mock('@/entities/quiz', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/entities/quiz')>()),
  playApi: { get: vi.fn() },
}))

const check = vi.mocked(trueFalsePlayApi.check)
const finish = vi.mocked(trueFalsePlayApi.finish)
const get = vi.mocked(playApi.get)

const TOKEN = 'abcdefghijklmnopqrstuv'
const RESULT = { percent: 50, grade: '3', correctCount: 1, partialCount: 0, totalCount: 2 }
const START = new Date('2026-01-01T10:00:00Z').getTime()
const SECOND = 1000

function initial(showAnswers = true, timer: unknown = { mode: 'none' }, statements = ['Земля плоская', 'Вода мокрая']) {
  return {
    type: 'truefalse' as const,
    trueFalse: { title: 'Факты', showAnswers, version: 'v1', timer, statements },
  } as never
}

const mounted: { unmount: () => void }[] = []

async function mountPlay(response = initial()) {
  const wrapper = await mountSuspended(TrueFalsePlay, { props: { token: TOKEN, initial: response }, attachTo: document.body })
  mounted.push(wrapper)
  await flushPromises()
  return wrapper
}

type Wrapper = Awaited<ReturnType<typeof mountPlay>>

const yes = (wrapper: Wrapper) => wrapper.findAll('.answer-buttons__button')[0]!
const no = (wrapper: Wrapper) => wrapper.findAll('.answer-buttons__button')[1]!
const live = (wrapper: Wrapper) => wrapper.get('.true-false-play__live').text()
const prevArrow = (wrapper: Wrapper) => wrapper.get('[aria-label="Предыдущее утверждение"]')
const nextArrow = (wrapper: Wrapper) => wrapper.get('[aria-label="Следующее утверждение"]')
const FAKE_TIMERS = ['Date', 'setInterval', 'clearInterval', 'setTimeout', 'clearTimeout'] as const

async function advance(ms: number): Promise<void> {
  await vi.advanceTimersByTimeAsync(ms)
  await flushPromises()
}

// Видимые слова: без блока aria-live для скринридера
function visibleWords(wrapper: Wrapper, word: string) {
  return wrapper.findAll('*').filter((element) => element.text() === word && !element.classes().includes('true-false-play__live'))
}

function press(key: string, init: KeyboardEventInit = {}, target: EventTarget = document): void {
  target.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, ...init }))
}

beforeEach(() => {
  vi.resetAllMocks()
  vi.spyOn(window.navigator, 'languages', 'get').mockReturnValue(['ru-RU'])
})

afterEach(() => {
  for (const wrapper of mounted.splice(0)) wrapper.unmount()
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('TrueFalsePlay: экран утверждения', () => {
  it('показывает утверждение по одному, прогресс и две кнопки со значком и подписью', async () => {
    const wrapper = await mountPlay()

    expect(wrapper.get('h1').text()).toBe('Земля плоская')
    expect(wrapper.get('.true-false-play__progress').text()).toBe('1 / 2')
    expect(yes(wrapper).text()).toContain('Да')
    expect(no(wrapper).text()).toContain('Нет')
    expect(yes(wrapper).get('.answer-buttons__icon').text()).toBe('✓')
    expect(no(wrapper).get('.answer-buttons__icon').text()).toBe('✕')
  })

  it('рядом со счётчиком две стрелки, обе неактивны на первом утверждении; кнопки «Дальше» нет', async () => {
    const wrapper = await mountPlay()

    expect(prevArrow(wrapper).attributes('disabled')).toBeDefined()
    expect(nextArrow(wrapper).attributes('disabled')).toBeDefined()
    expect(wrapper.find('.true-false-play__next').exists()).toBe(false)
  })

  it('фокус на заголовке утверждения при старте', async () => {
    const wrapper = await mountPlay()

    expect(document.activeElement).toBe(wrapper.get('h1').element)
  })

  it('до ответа в DOM нет подсказки о правильном ответе', async () => {
    const wrapper = await mountPlay()

    expect(live(wrapper)).toBe('')
    expect(wrapper.find('.true-false-play__verdict').exists()).toBe(false)
    expect(wrapper.find('.answer-buttons__button--correct').exists()).toBe(false)
    expect(wrapper.find('.answer-buttons__button--wrong').exists()).toBe(false)
    expect(wrapper.text()).not.toContain('✗')
    expect(wrapper.find('.answer-buttons__badge').exists()).toBe(false)
  })
})

describe('TrueFalsePlay: без показа ответов', () => {
  beforeEach(() => vi.useFakeTimers({ toFake: [...FAKE_TIMERS] }))

  it('ответ подсвечивает выбор без значка, через ANSWER_ADVANCE_MS открывается следующее утверждение', async () => {
    const wrapper = await mountPlay(initial(false))

    await yes(wrapper).trigger('click')
    await flushPromises()

    expect(check).not.toHaveBeenCalled()
    expect(yes(wrapper).classes()).toContain('answer-buttons__button--chosen')
    expect(wrapper.find('.answer-buttons__badge').exists()).toBe(false)
    expect(wrapper.get('h1').text()).toBe('Земля плоская')
    await advance(ANSWER_ADVANCE_MS)
    expect(wrapper.get('h1').text()).toBe('Вода мокрая')
    expect(document.activeElement).toBe(wrapper.get('h1').element)
  })

  it('«Нет» на последнем утверждении завершает игру: итог с процентом и оценкой, разбора нет', async () => {
    finish.mockResolvedValue({ result: RESULT })
    const wrapper = await mountPlay(initial(false))

    await yes(wrapper).trigger('click')
    await advance(ANSWER_ADVANCE_MS)
    await no(wrapper).trigger('click')
    await advance(ANSWER_ADVANCE_MS)

    expect(finish).toHaveBeenCalledWith(TOKEN, { version: 'v1', answers: [true, false] })
    expect(wrapper.get('h1').text()).toBe('Вы прошли задание «Факты»')
    expect(wrapper.text()).toContain('50%')
    expect(wrapper.text()).toContain('Оценка: 3')
    expect(wrapper.find('.review-row').exists()).toBe(false)
    expect(document.activeElement).toBe(wrapper.get('h1').element)
  })

  it('повторный клик во время задержки игнорируется', async () => {
    check.mockResolvedValue({ correct: true })
    finish.mockResolvedValue({ result: RESULT })
    const wrapper = await mountPlay()

    await yes(wrapper).trigger('click')
    await flushPromises()
    await no(wrapper).trigger('click')
    await advance(ANSWER_FEEDBACK_MS - 1)
    expect(check).toHaveBeenCalledOnce()
    expect(wrapper.get('h1').text()).toBe('Земля плоская')
    await advance(1)

    expect(wrapper.get('h1').text()).toBe('Вода мокрая')
    expect(check).toHaveBeenCalledOnce()
    expect(finish).not.toHaveBeenCalled()
    await no(wrapper).trigger('click')
    await advance(ANSWER_FEEDBACK_MS)
    expect(finish).toHaveBeenCalledOnce()
    expect(finish).toHaveBeenCalledWith(TOKEN, { version: 'v1', answers: [true, false] })
  })
})

describe('TrueFalsePlay: с показом ответов', () => {
  beforeEach(() => vi.useFakeTimers({ toFake: [...FAKE_TIMERS] }))

  it('ответ уходит в check, кнопка красится по вердикту со значком, слов под кнопками нет, верность объявляется', async () => {
    check.mockResolvedValue({ correct: true })
    const wrapper = await mountPlay()

    await no(wrapper).trigger('click')
    await flushPromises()

    expect(check).toHaveBeenCalledWith(TOKEN, { version: 'v1', index: 0, answer: false })
    expect(live(wrapper)).toBe('Верно')
    expect(wrapper.find('.true-false-play__verdict').exists()).toBe(false)
    expect(visibleWords(wrapper, 'Верно')).toHaveLength(0)
    expect(no(wrapper).classes()).toContain('answer-buttons__button--correct')
    const badge = no(wrapper).get('.answer-buttons__badge')
    expect(badge.text()).toBe('✓')
    expect(badge.attributes('aria-hidden')).toBe('true')
    expect(yes(wrapper).find('.answer-buttons__badge').exists()).toBe(false)
    expect(yes(wrapper).attributes('disabled')).toBeDefined()
    expect(no(wrapper).attributes('disabled')).toBeDefined()
  })

  it('неверный ответ: красная кнопка со значком ✗, слов «Неверно» в DOM нет', async () => {
    check.mockResolvedValue({ correct: false })
    const wrapper = await mountPlay()

    await yes(wrapper).trigger('click')
    await flushPromises()

    expect(live(wrapper)).toBe('Неверно')
    expect(visibleWords(wrapper, 'Неверно')).toHaveLength(0)
    expect(yes(wrapper).classes()).toContain('answer-buttons__button--wrong')
    expect(yes(wrapper).get('.answer-buttons__badge').text()).toBe('✗')
    expect(no(wrapper).classes()).not.toContain('answer-buttons__button--correct')
  })

  it('через ANSWER_FEEDBACK_MS после ответа сервера — следующее утверждение, фокус на заголовке; после последнего — итог с разбором', async () => {
    check.mockResolvedValue({ correct: true })
    finish.mockResolvedValue({ result: RESULT, review: [{ correct: true, answer: true }, { correct: false, answer: false }] })
    const wrapper = await mountPlay()

    await yes(wrapper).trigger('click')
    await flushPromises()
    await advance(ANSWER_FEEDBACK_MS - 1)
    expect(wrapper.get('h1').text()).toBe('Земля плоская')
    await advance(1)
    expect(wrapper.get('h1').text()).toBe('Вода мокрая')
    expect(document.activeElement).toBe(wrapper.get('h1').element)
    expect(live(wrapper)).toBe('')

    await yes(wrapper).trigger('click')
    await flushPromises()
    await advance(ANSWER_FEEDBACK_MS)

    expect(finish).toHaveBeenCalledWith(TOKEN, { version: 'v1', answers: [true, true] })
    expect(document.activeElement).toBe(wrapper.get('h1').element)
    const rows = wrapper.findAll('.review-row')
    expect(rows).toHaveLength(2)
    expect(rows[0]!.text()).toContain('Земля плоская')
    expect(rows[0]!.text()).toContain('Верно')
    expect(rows[1]!.text()).toContain('Вода мокрая')
    expect(rows[1]!.text()).toContain('Неверно')
    expect(rows[1]!.text()).toContain('Правильный ответ: Нет')
  })

  it('unmount во время задержки: finish не вызывается', async () => {
    check.mockResolvedValue({ correct: true })
    const wrapper = await mountPlay()
    await yes(wrapper).trigger('click')
    await flushPromises()
    await advance(ANSWER_FEEDBACK_MS)
    await yes(wrapper).trigger('click')
    await flushPromises()

    wrapper.unmount()
    mounted.splice(mounted.indexOf(wrapper), 1)
    await advance(ANSWER_FEEDBACK_MS * 2)

    expect(finish).not.toHaveBeenCalled()
  })
})

describe('TrueFalsePlay: стрелки и клавиши', () => {
  beforeEach(() => vi.useFakeTimers({ toFake: [...FAKE_TIMERS] }))

  async function answeredFirst() {
    check.mockResolvedValue({ correct: false })
    const wrapper = await mountPlay()
    await yes(wrapper).trigger('click')
    await flushPromises()
    await advance(ANSWER_FEEDBACK_MS)
    return wrapper
  }

  it('← показывает прошлое утверждение с той же подсветкой и значком, кнопки неактивны; → возвращает к текущему', async () => {
    const wrapper = await answeredFirst()
    expect(prevArrow(wrapper).attributes('disabled')).toBeUndefined()
    expect(nextArrow(wrapper).attributes('disabled')).toBeDefined()

    await prevArrow(wrapper).trigger('click')

    expect(wrapper.get('h1').text()).toBe('Земля плоская')
    expect(wrapper.get('.true-false-play__progress').text()).toBe('1 / 2')
    expect(yes(wrapper).classes()).toContain('answer-buttons__button--wrong')
    expect(yes(wrapper).get('.answer-buttons__badge').text()).toBe('✗')
    expect(yes(wrapper).attributes('disabled')).toBeDefined()
    expect(no(wrapper).attributes('disabled')).toBeDefined()
    expect(live(wrapper)).toBe('')
    expect(prevArrow(wrapper).attributes('disabled')).toBeDefined()

    await nextArrow(wrapper).trigger('click')

    expect(wrapper.get('h1').text()).toBe('Вода мокрая')
    expect(wrapper.get('.true-false-play__progress').text()).toBe('2 / 2')
    expect(yes(wrapper).attributes('disabled')).toBeUndefined()
    expect(nextArrow(wrapper).attributes('disabled')).toBeDefined()
  })

  it('клавиши ArrowLeft и ArrowRight делают то же самое', async () => {
    const wrapper = await answeredFirst()

    press('ArrowLeft')
    await flushPromises()
    expect(wrapper.get('h1').text()).toBe('Земля плоская')

    press('ArrowRight')
    await flushPromises()
    expect(wrapper.get('h1').text()).toBe('Вода мокрая')

    press('ArrowRight')
    await flushPromises()
    expect(wrapper.get('h1').text()).toBe('Вода мокрая')
  })

  it('клавиши игнорируются в поле ввода и с модификаторами', async () => {
    const wrapper = await answeredFirst()
    const input = document.createElement('input')
    document.body.append(input)

    press('ArrowLeft', {}, input)
    press('ArrowLeft', { ctrlKey: true })
    press('ArrowLeft', { altKey: true })
    press('ArrowLeft', { metaKey: true })
    press('ArrowLeft', { shiftKey: true })
    await flushPromises()
    input.remove()

    expect(wrapper.get('h1').text()).toBe('Вода мокрая')
  })

  it('во время задержки автоперехода стрелки неактивны', async () => {
    check.mockResolvedValue({ correct: true })
    const wrapper = await answeredFirst()

    await yes(wrapper).trigger('click')
    await flushPromises()

    expect(prevArrow(wrapper).attributes('disabled')).toBeDefined()
    press('ArrowLeft')
    await flushPromises()
    expect(wrapper.get('h1').text()).toBe('Вода мокрая')
  })

  async function threeAnswered() {
    const wrapper = await mountPlay(initial(false, { mode: 'none' }, ['A', 'B', 'C']))
    for (const button of [yes, no]) {
      await button(wrapper).trigger('click')
      await advance(ANSWER_ADVANCE_MS)
    }
    return wrapper
  }

  it('после автоперехода фокус на заголовке, листание стрелкой оставляет фокус на ней', async () => {
    const wrapper = await threeAnswered()
    expect(document.activeElement).toBe(wrapper.get('h1').element)
    const prev = prevArrow(wrapper).element as HTMLElement
    prev.focus()

    await prevArrow(wrapper).trigger('click')
    await flushPromises()

    expect(wrapper.get('h1').text()).toBe('B')
    expect(document.activeElement).toBe(prev)
  })

  it('стрелка погасла на границе: фокус уходит на соседнюю', async () => {
    const wrapper = await threeAnswered()
    const prev = prevArrow(wrapper).element as HTMLElement
    prev.focus()
    await prevArrow(wrapper).trigger('click')
    await flushPromises()

    await prevArrow(wrapper).trigger('click')
    await flushPromises()
    expect(wrapper.get('h1').text()).toBe('A')
    expect(document.activeElement).toBe(nextArrow(wrapper).element)

    await nextArrow(wrapper).trigger('click')
    await nextArrow(wrapper).trigger('click')
    await flushPromises()
    expect(wrapper.get('h1').text()).toBe('C')
    expect(document.activeElement).toBe(prev)
  })

  it('клавиши не двигают фокус', async () => {
    const wrapper = await threeAnswered()
    expect(document.activeElement).toBe(wrapper.get('h1').element)

    press('ArrowLeft')
    await flushPromises()

    expect(wrapper.get('h1').text()).toBe('B')
    expect(document.activeElement).toBe(wrapper.get('h1').element)
  })

  it('после unmount обработчик клавиш снят', async () => {
    const wrapper = await answeredFirst()
    const removeSpy = vi.spyOn(document, 'removeEventListener')

    wrapper.unmount()
    mounted.splice(mounted.indexOf(wrapper), 1)

    expect(removeSpy).toHaveBeenCalledWith('keydown', expect.any(Function))
  })
})

describe('TrueFalsePlay: ошибки', () => {
  beforeEach(() => vi.useFakeTimers({ toFake: [...FAKE_TIMERS] }))

  it('409 на check — сообщение и «Начать заново», которое грузит задание заново', async () => {
    check.mockRejectedValue(new ApiError(409))
    const wrapper = await mountPlay()

    await yes(wrapper).trigger('click')
    await flushPromises()
    expect(wrapper.get('[role="alert"]').text()).toBe('Задание изменилось, начните заново')

    get.mockResolvedValue(initial())
    await wrapper.get('.true-false-play__button').trigger('click')
    await flushPromises()

    expect(get).toHaveBeenCalledWith(TOKEN)
    expect(wrapper.get('h1').text()).toBe('Земля плоская')
  })

  it('сетевая ошибка — «Повторить» отправляет тот же ответ', async () => {
    check.mockRejectedValueOnce(new Error('network'))
    check.mockResolvedValueOnce({ correct: true })
    const wrapper = await mountPlay()

    await no(wrapper).trigger('click')
    await flushPromises()
    expect(wrapper.get('[role="alert"]').text()).toBe('Не получилось, попробуйте ещё раз')

    await wrapper.get('.true-false-play__button').trigger('click')
    await flushPromises()

    expect(check).toHaveBeenLastCalledWith(TOKEN, { version: 'v1', index: 0, answer: false })
    expect(live(wrapper)).toBe('Верно')
  })
})

describe('TrueFalsePlay: таймер', () => {
  it('лимит: по истечении finish уходит с null у неотвеченных, у итога отмечено «время вышло»', async () => {
    vi.useFakeTimers({ toFake: [...FAKE_TIMERS] })
    vi.setSystemTime(START)
    finish.mockResolvedValue({ result: RESULT })
    const wrapper = await mountPlay(initial(false, { mode: 'limit', seconds: 60 }))
    expect(wrapper.get('.play-timer__time').text()).toBe('1:00')

    await yes(wrapper).trigger('click')
    await flushPromises()
    vi.setSystemTime(START + 60 * SECOND)
    await vi.advanceTimersByTimeAsync(SECOND)
    await flushPromises()

    expect(finish).toHaveBeenCalledWith(TOKEN, { version: 'v1', answers: [true, null] })
    expect(wrapper.text()).toContain('Время вышло: неотвеченные утверждения засчитаны как неверные')
  })

  it('секундомер: в итоге показано затраченное время', async () => {
    vi.useFakeTimers({ toFake: [...FAKE_TIMERS] })
    vi.setSystemTime(START)
    finish.mockResolvedValue({ result: RESULT })
    const wrapper = await mountPlay(initial(false, { mode: 'stopwatch' }))

    await yes(wrapper).trigger('click')
    await advance(ANSWER_ADVANCE_MS)
    vi.setSystemTime(START + 65 * SECOND)
    await yes(wrapper).trigger('click')
    await advance(ANSWER_ADVANCE_MS)

    expect(wrapper.text()).toContain('Время: 1:05')
  })
})
