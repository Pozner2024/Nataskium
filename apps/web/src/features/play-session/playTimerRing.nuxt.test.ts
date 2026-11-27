import { mountSuspended } from '@nuxt/test-utils/runtime'
import { flushPromises } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest'
import { computed, defineComponent, h, nextTick, ref, type Ref } from 'vue'
import type { QuizTimer } from '@nataskium/shared/schemas'
import PlayTimer from './PlayTimer.vue'
import PlayTimerPortal from './PlayTimerPortal.vue'
import { PLAYER_TIMER_SLOT_KEY } from './playerKeys'
import { PLAY_TIMER_KEY, usePlayTimer, type PlayTimerView } from './usePlayTimer'

const START = new Date('2026-01-01T10:00:00Z').getTime()
const SECOND = 1000
const TURN_LENGTH = 2 * Math.PI * 45

const mounted: { unmount: () => void }[] = []

function stubReducedMotion(reduced: boolean): void {
  vi.spyOn(window, 'matchMedia').mockImplementation(
    (query: string) => ({ matches: reduced && query.includes('reduce'), media: query, addEventListener: vi.fn(), removeEventListener: vi.fn() }) as unknown as MediaQueryList,
  )
}

type Controls = { startedAt: Ref<number | null>; timedOut: Ref<boolean>; isFinished: Ref<boolean>; expire: Mock<() => void> }

// Живой таймер на настоящем usePlayTimer: цифры и кольцо считают от одной метки
async function mountLive(timer: QuizTimer) {
  const controls: Controls = { startedAt: ref(START), timedOut: ref(false), isFinished: ref(false), expire: vi.fn<() => void>() }
  const Host = defineComponent({
    setup() {
      const view = usePlayTimer({ timer: ref(timer), elapsedSeconds: ref(null), ...controls })
      return () => h(
        defineComponent({ provide: { [PLAY_TIMER_KEY as symbol]: view }, render: () => h(PlayTimer, { mode: timer.mode }) }),
      )
    },
  })
  const wrapper = await mountSuspended(Host)
  mounted.push(wrapper)
  await flushPromises()
  return { wrapper, controls }
}

function stub(partial: { elapsed?: number; remaining?: number | null; low?: boolean }): PlayTimerView {
  return {
    elapsedSeconds: computed(() => partial.elapsed ?? 0),
    remainingSeconds: computed(() => partial.remaining ?? null),
    isLow: computed(() => partial.low ?? false),
    announcement: ref(''),
  }
}

async function mountStub(mode: QuizTimer['mode'], view: PlayTimerView) {
  const wrapper = await mountSuspended(PlayTimer, { props: { mode }, global: { provide: { [PLAY_TIMER_KEY as symbol]: view } } })
  mounted.push(wrapper)
  return wrapper
}

function dashOffset(wrapper: { get: (selector: string) => { attributes: (name?: string) => Record<string, string> | string } }): number {
  const style = String(wrapper.get('.play-timer__dial').attributes('style'))
  return Number(/--offset:\s*([\d.]+)px/.exec(style)?.[1])
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date', 'setInterval', 'clearInterval', 'requestAnimationFrame', 'cancelAnimationFrame'] })
  vi.setSystemTime(START)
  stubReducedMotion(false)
})

afterEach(() => {
  for (const wrapper of mounted.splice(0)) wrapper.unmount()
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('PlayTimer: режимы limit и free (секундомер)', () => {
  it('limit: цифры — остаток, класс --limit, подпись «осталось»', async () => {
    const { wrapper } = await mountLive({ mode: 'limit', seconds: 120 })
    await vi.advanceTimersByTimeAsync(5 * SECOND)

    expect(wrapper.get('.play-timer__time').text()).toBe('1:55')
    expect(wrapper.get('.play-timer').classes()).toContain('play-timer--limit')
  })

  it('секундомер: цифры растут, класса --limit нет', async () => {
    const { wrapper } = await mountLive({ mode: 'stopwatch' })
    await vi.advanceTimersByTimeAsync(65 * SECOND)

    expect(wrapper.get('.play-timer__time').text()).toBe('1:05')
    expect(wrapper.get('.play-timer').classes()).not.toContain('play-timer--limit')
  })

  it('длинный лимит: цифры формата 180:00 и переменная --chars для размера шрифта', async () => {
    const { wrapper } = await mountLive({ mode: 'limit', seconds: 180 * 60 })

    expect(wrapper.get('.play-timer__time').text()).toBe('180:00')
    expect(wrapper.get('.play-timer__time').attributes('style')).toContain('--chars: 6')
  })

  it('лимит истёк: цифры 0:00, класс --active снят, кольцо пустое', async () => {
    const { wrapper } = await mountLive({ mode: 'limit', seconds: 10 })
    await vi.advanceTimersByTimeAsync(11 * SECOND)

    expect(wrapper.get('.play-timer__time').text()).toBe('0:00')
    expect(wrapper.get('.play-timer').classes()).not.toContain('play-timer--active')
    expect(dashOffset(wrapper)).toBeCloseTo(TURN_LENGTH)
  })

  it('режим none: ничего не рисуется', async () => {
    const wrapper = await mountStub('none', stub({}))
    expect(wrapper.find('.play-timer').exists()).toBe(false)
  })

  it('role="timer" с подписью и без aria-live на цифрах', async () => {
    const wrapper = await mountStub('limit', stub({ remaining: 300 }))
    expect(wrapper.attributes('role')).toBe('timer')
    expect(wrapper.attributes('aria-label')).toBe('Таймер')
    expect(wrapper.find('[aria-live]').exists()).toBe(false)
    expect(wrapper.attributes('aria-live')).toBeUndefined()
  })

  it('без провайдера (inject пуст) таймер не рисуется и не падает', async () => {
    const wrapper = await mountSuspended(PlayTimer, { props: { mode: 'limit' } })
    mounted.push(wrapper)
    expect(wrapper.find('.play-timer').exists()).toBe(false)
  })
})

describe('PlayTimer: низкое время', () => {
  it('класс --low и текст появляются один раз при пересечении порога, не мигают после', async () => {
    const { wrapper } = await mountLive({ mode: 'limit', seconds: 40 })
    expect(wrapper.find('.play-timer__low').exists()).toBe(false)

    await vi.advanceTimersByTimeAsync(29 * SECOND)
    expect(wrapper.find('.play-timer--low').exists()).toBe(false)

    await vi.advanceTimersByTimeAsync(SECOND)
    expect(wrapper.find('.play-timer--low').exists()).toBe(true)
    expect(wrapper.findAll('.play-timer__low')).toHaveLength(1)

    await vi.advanceTimersByTimeAsync(5 * SECOND)
    expect(wrapper.findAll('.play-timer__low')).toHaveLength(1)
    expect(wrapper.find('.play-timer--low').exists()).toBe(true)
  })

  it('секундомер не бывает «мало времени»', async () => {
    const { wrapper } = await mountLive({ mode: 'stopwatch' })
    await vi.advanceTimersByTimeAsync(600 * SECOND)

    expect(wrapper.find('.play-timer--low').exists()).toBe(false)
  })
})

describe('PlayTimer: кольцо и reduced-motion', () => {
  it('обычный режим: кольцо двигается по кадрам плавнее секунды', async () => {
    const { wrapper } = await mountLive({ mode: 'stopwatch' })
    const before = dashOffset(wrapper)

    await vi.advanceTimersByTimeAsync(500)

    expect(dashOffset(wrapper)).toBeLessThan(before)
    expect(wrapper.get('.play-timer__time').text()).toBe('0:00')
  })

  it('reduced-motion: кадры не запрашиваются, кольцо шагает раз в секунду', async () => {
    stubReducedMotion(true)
    const raf = vi.spyOn(window, 'requestAnimationFrame')
    const { wrapper } = await mountLive({ mode: 'stopwatch' })
    const start = dashOffset(wrapper)

    await vi.advanceTimersByTimeAsync(500)
    expect(raf).not.toHaveBeenCalled()
    expect(dashOffset(wrapper)).toBe(start)

    await vi.advanceTimersByTimeAsync(500)
    expect(dashOffset(wrapper)).toBeLessThan(start)
  })

  it('размонтирование отменяет запрошенный кадр', async () => {
    const cancel = vi.spyOn(window, 'cancelAnimationFrame')
    const { wrapper } = await mountLive({ mode: 'stopwatch' })

    wrapper.unmount()

    expect(cancel).toHaveBeenCalled()
  })

  it('после полной минуты полоса сбрасывается в начало круга', async () => {
    stubReducedMotion(true)
    const { wrapper } = await mountLive({ mode: 'stopwatch' })

    await vi.advanceTimersByTimeAsync(59 * SECOND)
    expect(dashOffset(wrapper)).toBeLessThan(TURN_LENGTH / 10)

    await vi.advanceTimersByTimeAsync(SECOND)
    expect(dashOffset(wrapper)).toBeCloseTo(TURN_LENGTH)
  })
})

describe('PlayTimer: колонка проигрывателя', () => {
  function slot(target: HTMLElement | null) {
    const detach = vi.fn()
    const attach = vi.fn(() => detach)
    return { slot: { target: ref(target), attach }, attach, detach }
  }

  async function mountInSlot(target: HTMLElement | null, mode: QuizTimer['mode'] = 'stopwatch') {
    const probe = slot(target)
    const wrapper = await mountSuspended(PlayTimer, {
      props: { mode },
      global: { provide: { [PLAY_TIMER_KEY as symbol]: stub({ elapsed: 3 }), [PLAYER_TIMER_SLOT_KEY as symbol]: probe.slot } },
    })
    mounted.push(wrapper)
    await nextTick()
    return { wrapper, ...probe }
  }

  it('таймер показан в слоте: проигрыватель уведомлён, при размонтировании отпущен', async () => {
    const { wrapper, attach, detach } = await mountInSlot(document.createElement('div'))
    expect(attach).toHaveBeenCalledTimes(1)

    wrapper.unmount()
    expect(detach).toHaveBeenCalledTimes(1)
  })

  it('слота-цели нет (null): колонка не отводится', async () => {
    const { attach } = await mountInSlot(null)
    expect(attach).not.toHaveBeenCalled()
  })

  it('режим none: колонка не отводится', async () => {
    const { attach } = await mountInSlot(document.createElement('div'), 'none')
    expect(attach).not.toHaveBeenCalled()
  })
})

describe('PlayTimerPortal', () => {
  it('с проигрывателем переносит содержимое в его контейнер, без него остаётся на месте', async () => {
    const target = document.createElement('div')
    document.body.append(target)
    const inPlayer = await mountSuspended(PlayTimerPortal, {
      slots: { default: () => h('i', { class: 'moved' }) },
      global: { provide: { [PLAYER_TIMER_SLOT_KEY as symbol]: { target: ref(target), attach: vi.fn() } } },
    })
    mounted.push(inPlayer)
    expect(target.querySelector('.moved')).not.toBeNull()

    const alone = await mountSuspended(PlayTimerPortal, { slots: { default: () => h('i', { class: 'stays' }) } })
    mounted.push(alone)
    expect(alone.find('.stays').exists()).toBe(true)
    target.remove()
  })
})
