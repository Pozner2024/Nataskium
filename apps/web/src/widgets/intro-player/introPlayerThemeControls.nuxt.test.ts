import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h, inject } from 'vue'
import { flushPromises } from '@vue/test-utils'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import { PLAYER_ENTRANCE_KEY, type PlayerEntrance } from '@/features/play-session'
import { IntroPlayer } from '@/widgets/intro-player'

// Сцена, звук и вылет подменены: проверяется, как проигрыватель ими управляет
const fakes = vi.hoisted(() => ({
  scene: { play: vi.fn<() => Promise<void>>(), skip: vi.fn(), finishPlay: () => {} },
  sound: { unlock: vi.fn(), play: vi.fn(), setMuted: vi.fn(), stop: vi.fn(), dispose: vi.fn() },
  entrance: { run: vi.fn(async () => {}), cancel: vi.fn() },
  createIntroEntrance: vi.fn(),
  createIntroSound: vi.fn(),
  context: null as PlayerEntrance | null,
}))

vi.mock('@/entities/intro-theme', async (importOriginal) => {
  const original = await importOriginal<typeof import('@/entities/intro-theme')>()
  const IntroTheme = defineComponent({
    props: { themeKey: { type: String, default: null } },
    setup(_props, { expose }) {
      expose({ play: fakes.scene.play, skip: fakes.scene.skip })
      return () => h('div', { class: 'scene-stub' })
    },
  })
  return { ...original, IntroTheme, createIntroEntrance: fakes.createIntroEntrance, createIntroSound: fakes.createIntroSound }
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

// Игра в слоте забирает контекст вылета, как EntranceCard
const Game = defineComponent({
  setup() {
    fakes.context = inject(PLAYER_ENTRANCE_KEY, null)
    return () => h('p', { class: 'game' }, 'Вопрос 1')
  },
})

function mountPlayer(introTheme: string | null) {
  return mountSuspended(IntroPlayer, { props: { ...LABELS, introTheme }, slots: { default: () => h(Game) } })
}

type Wrapper = Awaited<ReturnType<typeof mountPlayer>>

function prefersReducedMotion(reduce: boolean) {
  vi.spyOn(window, 'matchMedia').mockReturnValue({ matches: reduce } as MediaQueryList)
}

async function waitFrames() {
  await flushPromises()
  // Проигрыватель ждёт два кадра, пока устоится размер
  await new Promise((resolve) => setTimeout(resolve, 50))
  await flushPromises()
}

async function startAndFinishIntro(wrapper: Wrapper) {
  await wrapper.get('.intro-player__start-button').trigger('click')
  await waitFrames()
  fakes.scene.finishPlay()
  await flushPromises()
}

describe('IntroPlayer: звук, пропуск и вылет темы кодом', () => {
  beforeEach(() => {
    prefersReducedMotion(false)
    fakes.context = null
    fakes.scene.play.mockImplementation(() => new Promise<void>((resolve) => (fakes.scene.finishPlay = resolve)))
    fakes.createIntroSound.mockReturnValue(fakes.sound)
    fakes.createIntroEntrance.mockReturnValue(fakes.entrance)
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.clearAllMocks()
  })

  it('звук включается в самом нажатии «Начать» (жест пользователя), до запуска сцены', async () => {
    const wrapper = await mountPlayer('nataskium-night')
    const click = wrapper.get('.intro-player__start-button').trigger('click')
    expect(fakes.sound.unlock).toHaveBeenCalledTimes(1)
    expect(fakes.scene.play).not.toHaveBeenCalled()
    await click
    await waitFrames()
    expect(fakes.scene.play).toHaveBeenCalledTimes(1)
  })

  it('при reduced motion звук не включается, интро не играет', async () => {
    prefersReducedMotion(true)
    const wrapper = await mountPlayer('nataskium-night')
    await wrapper.get('.intro-player__start-button').trigger('click')
    await flushPromises()
    expect(fakes.sound.unlock).not.toHaveBeenCalled()
    expect(fakes.scene.play).not.toHaveBeenCalled()
  })

  it('кнопка звука глушит и включает звуки темы', async () => {
    const wrapper = await mountPlayer('nataskium-night')
    await wrapper.get('.intro-player__start-button').trigger('click')
    await waitFrames()
    await wrapper.get('[aria-label="Выключить звук"]').trigger('click')
    expect(fakes.sound.setMuted).toHaveBeenLastCalledWith(true)
    await wrapper.get('[aria-label="Включить звук"]').trigger('click')
    expect(fakes.sound.setMuted).toHaveBeenLastCalledWith(false)
  })

  it('«Пропустить» во время интро обрывает звук', async () => {
    const wrapper = await mountPlayer('nataskium-night')
    await wrapper.get('.intro-player__start-button').trigger('click')
    await waitFrames()
    await wrapper.get('.intro-player__skip').trigger('click')
    expect(fakes.sound.stop).toHaveBeenCalledTimes(1)
  })

  it('«Пропустить» в первые кадры после «Начать» — сцена не запускается, игра открыта один раз', async () => {
    const wrapper = await mountPlayer('nataskium-night')
    await wrapper.get('.intro-player__start-button').trigger('click')
    await wrapper.get('.intro-player__skip').trigger('click')
    await waitFrames()
    expect(fakes.scene.play).not.toHaveBeenCalled()
    expect(wrapper.find('.game').exists()).toBe(true)
    expect(wrapper.emitted('done')).toHaveLength(1)
  })

  it('уход со страницы посреди интро освобождает звук без ошибок', async () => {
    const wrapper = await mountPlayer('nataskium-night')
    await wrapper.get('.intro-player__start-button').trigger('click')
    await waitFrames()
    expect(() => wrapper.unmount()).not.toThrow()
    expect(fakes.sound.dispose).toHaveBeenCalledTimes(1)
  })

  it('вылет отдаётся игре один раз: первый вопрос получает его, следующий — нет', async () => {
    const wrapper = await mountPlayer('nataskium-night')
    await startAndFinishIntro(wrapper)
    expect(wrapper.find('.game').exists()).toBe(true)
    expect(fakes.context?.framed).toBe(true)
    expect(fakes.context?.take()).toBe(fakes.entrance)
    expect(fakes.context?.take()).toBeNull()
    // Звук нужен и при смене вопроса: он закрывается только при уходе из проигрывателя, не после вылета
    expect(fakes.sound.dispose).not.toHaveBeenCalled()
    expect(fakes.createIntroEntrance).toHaveBeenCalledTimes(1)
    const [themeKey, stage, reducedMotion, sound] = fakes.createIntroEntrance.mock.calls[0]!
    expect(themeKey).toBe('nataskium-night')
    expect(stage).toBe(wrapper.get('.intro-player').element)
    expect(reducedMotion).toBe(false)
    expect(sound).toBe(fakes.sound)
  })

  it('при reduced motion вылет запрашивается в режиме без движения', async () => {
    prefersReducedMotion(true)
    const wrapper = await mountPlayer('nataskium-night')
    await wrapper.get('.intro-player__start-button').trigger('click')
    await flushPromises()
    fakes.context?.take()
    expect(fakes.createIntroEntrance.mock.calls[0]?.[2]).toBe(true)
  })

  it('без темы: рамки нет, вылета нет, звуки не создаются', async () => {
    const wrapper = await mountPlayer(null)
    await wrapper.get('.intro-player__start-button').trigger('click')
    await flushPromises()
    expect(fakes.context?.framed).toBe(false)
    expect(fakes.context?.take()).toBeNull()
    expect(fakes.createIntroSound).not.toHaveBeenCalled()
  })

  it('пустой ключ темы (?theme=) ведёт себя как «без темы»: рамки нет', async () => {
    const wrapper = await mountPlayer('')
    await wrapper.get('.intro-player__start-button').trigger('click')
    await flushPromises()
    expect(wrapper.find('.scene-stub').exists()).toBe(false)
    expect(fakes.context?.take()).toBeNull()
    expect(fakes.context?.framed).toBe(false)
  })
})
