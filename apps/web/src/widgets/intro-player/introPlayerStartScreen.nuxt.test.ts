import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h, inject } from 'vue'
import { flushPromises } from '@vue/test-utils'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import { PLAYER_TIMER_SLOT_KEY } from '@/features/play-session'
import { IntroPlayer } from '@/widgets/intro-player'

// Сцена темы подменена: проверяется стартовый экран и полоса игры, а не анимация
const scene = vi.hoisted(() => ({ play: vi.fn<() => Promise<void>>(), skip: vi.fn() }))

vi.mock('@/entities/intro-theme', async (importOriginal) => {
  const original = await importOriginal<typeof import('@/entities/intro-theme')>()
  const IntroTheme = defineComponent({
    props: { themeKey: { type: String, default: null } },
    setup(_props, { expose }) {
      expose({ play: scene.play, skip: scene.skip })
      return () => h('div', { class: 'scene-stub' })
    },
  })
  return { ...original, IntroTheme }
})

const LABELS = {
  typeLabel: 'Викторина',
  title: 'Столицы Европы',
  hint: 'Выберите правильный ответ',
  startLabel: 'Начать',
  skipLabel: 'Пропустить заставку',
  enterFullscreenLabel: 'На весь экран',
  exitFullscreenLabel: 'Выйти из полноэкранного режима',
  unmuteLabel: 'Включить звук',
  muteLabel: 'Выключить звук',
  scrollDownLabel: 'Прокрутить вниз',
}

const VIDEO = '/intro.mp4'
const THEMES = ['nataskium-night', 'nataskium-day'] as const
const mounted: { unmount: () => void }[] = []
const game = { withTimer: false }

// Игра-пробник: с таймером занимает место в полосе, как PlayTimer
const Game = defineComponent({
  setup() {
    const slot = inject(PLAYER_TIMER_SLOT_KEY, null)
    if (game.withTimer) slot?.attach()
    return () => h('p', { class: 'game' }, 'Вопрос 1')
  },
})

async function mountPlayer(props: Record<string, unknown> = {}) {
  const wrapper = await mountSuspended(IntroPlayer, { props: { ...LABELS, ...props }, slots: { default: () => h(Game) } })
  mounted.push(wrapper)
  await flushPromises()
  return wrapper
}

type Wrapper = Awaited<ReturnType<typeof mountPlayer>>

async function clickStart(wrapper: Wrapper) {
  await wrapper.get('.intro-player__start-button').trigger('click')
  await flushPromises()
  // Проигрыватель с темой ждёт два кадра, пока устоится размер
  await new Promise((resolve) => setTimeout(resolve, 50))
  await flushPromises()
}

function prefersReducedMotion(reduce: boolean) {
  vi.spyOn(window, 'matchMedia').mockReturnValue({ matches: reduce } as MediaQueryList)
}

// happy-dom: полноэкранный режим включается подменой, исходные свойства возвращаются после теста
const requestFullscreen = vi.fn(async () => {})
const originalRequest = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'requestFullscreen')

function allowFullscreen(enabled: boolean) {
  Object.defineProperty(document, 'fullscreenEnabled', { configurable: true, value: enabled })
}

function isTimerShown(wrapper: Wrapper): boolean {
  return (wrapper.get('.intro-player__timer').element as HTMLElement).style.display !== 'none'
}

beforeEach(() => {
  game.withTimer = false
  prefersReducedMotion(false)
  scene.play.mockImplementation(() => new Promise<void>(() => {}))
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined)
  vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => undefined)
  Object.defineProperty(HTMLElement.prototype, 'requestFullscreen', { configurable: true, writable: true, value: requestFullscreen })
  allowFullscreen(false)
})

afterEach(() => {
  for (const wrapper of mounted.splice(0)) wrapper.unmount()
  vi.restoreAllMocks()
  requestFullscreen.mockClear()
  scene.play.mockReset()
  Reflect.deleteProperty(document, 'fullscreenEnabled')
  if (originalRequest) Object.defineProperty(HTMLElement.prototype, 'requestFullscreen', originalRequest)
  else Reflect.deleteProperty(HTMLElement.prototype, 'requestFullscreen')
})

describe('IntroPlayer: подложка стартового экрана', () => {
  it('без темы подложка под карточкой и «Пропустить» есть', async () => {
    const wrapper = await mountPlayer({ src: VIDEO, skippable: true })
    expect(wrapper.get('.intro-player__console').classes()).toContain('intro-player__console--scrim')
    expect(wrapper.get('.intro-player__skip').classes()).toContain('intro-player__skip--scrim')
  })

  it('без темы «Пропустить» во время ролика тоже на подложке', async () => {
    const wrapper = await mountPlayer({ src: VIDEO })
    await clickStart(wrapper)
    expect(wrapper.get('.intro-player__skip').classes()).toContain('intro-player__skip--scrim')
  })

  for (const theme of THEMES) {
    it(`у темы ${theme} подложки нет ни у карточки, ни у «Пропустить»`, async () => {
      const wrapper = await mountPlayer({ introTheme: theme, skippable: true })
      expect(wrapper.get('.intro-player__console').classes()).not.toContain('intro-player__console--scrim')
      expect(wrapper.get('.intro-player__skip').classes()).not.toContain('intro-player__skip--scrim')
    })
  }
})

// Решение пользователя 2026-11-22 (заменило «полосы нет» от 2026-11-21): в игре на телефоне таймер и кнопки
// стоят в сплошной полосе сверху, игра листается под ней; на планшете и шире полоса скрыта стилями
describe('IntroPlayer: полоса игры', () => {
  for (const fullscreen of [false, true]) {
    it(`в игре полоса есть, кнопки в ней; кнопка полного экрана ${fullscreen ? 'есть' : 'нет'}`, async () => {
      game.withTimer = true
      allowFullscreen(fullscreen)
      const wrapper = await mountPlayer()
      await clickStart(wrapper)

      expect(wrapper.find('.game').exists()).toBe(true)
      expect(wrapper.find('.intro-player__bar').exists()).toBe(true)
      expect(wrapper.get('.intro-player__controls').classes()).toContain('intro-player__controls--bar')
      expect(isTimerShown(wrapper)).toBe(true)
      expect(wrapper.get('.intro-player__controls').find('[aria-label="На весь экран"]').exists()).toBe(fullscreen)
    })
  }

  it('на стартовом экране место таймера в DOM, но скрыто; кнопки внизу, не в углу игры', async () => {
    game.withTimer = true
    allowFullscreen(true)
    const wrapper = await mountPlayer()
    expect(wrapper.find('.intro-player__start').exists()).toBe(true)
    expect(isTimerShown(wrapper)).toBe(false)
    expect(wrapper.get('.intro-player__controls').classes()).not.toContain('intro-player__controls--game')
    expect(wrapper.find('.intro-player__bar').exists()).toBe(false)
    expect(wrapper.get('.intro-player__controls').classes()).not.toContain('intro-player__controls--bar')
  })

  it('intro=false: игра без таймера в углу, место для таймера в DOM', async () => {
    game.withTimer = true
    allowFullscreen(true)
    const wrapper = await mountPlayer({ intro: false })
    expect(wrapper.find('.game').exists()).toBe(true)
    expect(isTimerShown(wrapper)).toBe(false)
    expect(wrapper.find('.intro-player__timer').exists()).toBe(true)
  })
})

describe('IntroPlayer: шагов на стартовом экране нет', () => {
  it('без темы: ни на старте, ни во время ролика, ни в игре', async () => {
    const wrapper = await mountPlayer({ src: VIDEO })
    expect(wrapper.find('.intro-player__start').exists()).toBe(true)
    expect(wrapper.find('.intro-player__step').exists()).toBe(false)

    await clickStart(wrapper)
    expect(wrapper.find('.intro-player__skip').exists()).toBe(true)
    expect(wrapper.find('.intro-player__step').exists()).toBe(false)

    await wrapper.get('.intro-player__skip').trigger('click')
    await flushPromises()
    expect(wrapper.find('.game').exists()).toBe(true)
    expect(wrapper.find('.intro-player__step').exists()).toBe(false)
  })

  for (const theme of THEMES) {
    it(`тема ${theme}: ни на старте, ни во время интро, ни в игре`, async () => {
      const wrapper = await mountPlayer({ introTheme: theme })
      expect(wrapper.find('.intro-player__start').exists()).toBe(true)
      expect(wrapper.find('.intro-player__step').exists()).toBe(false)

      await clickStart(wrapper)
      expect(scene.play).toHaveBeenCalledTimes(1)
      expect(wrapper.find('.intro-player__skip').exists()).toBe(true)
      expect(wrapper.find('.intro-player__step').exists()).toBe(false)

      await wrapper.get('.intro-player__skip').trigger('click')
      await flushPromises()
      expect(wrapper.find('.game').exists()).toBe(true)
      expect(wrapper.find('.intro-player__step').exists()).toBe(false)
    })
  }
})

describe('IntroPlayer: «Начать» не включает полный экран', () => {
  const paths = [
    { name: 'ролик', props: { src: VIDEO }, reduce: false },
    { name: 'без ролика', props: {}, reduce: false },
    { name: 'тема кодом', props: { introTheme: 'nataskium-night' }, reduce: false },
    { name: 'тема кодом при reduced motion', props: { introTheme: 'nataskium-night' }, reduce: true },
  ]

  for (const path of paths) {
    it(`${path.name}: requestFullscreen не вызывается`, async () => {
      prefersReducedMotion(path.reduce)
      allowFullscreen(true)
      const wrapper = await mountPlayer(path.props)
      await clickStart(wrapper)
      expect(wrapper.find('.intro-player__start').exists()).toBe(false)
      expect(requestFullscreen).not.toHaveBeenCalled()
    })
  }

  it('контроль: «На весь экран» в углу игры вызывает requestFullscreen', async () => {
    allowFullscreen(true)
    const wrapper = await mountPlayer()
    await clickStart(wrapper)
    await wrapper.get('[aria-label="На весь экран"]').trigger('click')
    await flushPromises()
    expect(requestFullscreen).toHaveBeenCalledTimes(1)
  })

  it('контроль: кнопка полного экрана во время ролика вызывает requestFullscreen', async () => {
    allowFullscreen(true)
    const wrapper = await mountPlayer({ src: VIDEO })
    await clickStart(wrapper)
    await wrapper.get('[aria-label="На весь экран"]').trigger('click')
    await flushPromises()
    expect(requestFullscreen).toHaveBeenCalledTimes(1)
  })
})
