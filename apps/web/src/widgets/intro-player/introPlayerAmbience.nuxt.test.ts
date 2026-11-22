import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h } from 'vue'
import { flushPromises } from '@vue/test-utils'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import { IntroPlayer } from '@/widgets/intro-player'

// Сцена темы подменена: проверяется, в каких фазах проигрыватель показывает живой фон, а не сама анимация
const scene = vi.hoisted(() => ({ play: vi.fn<() => Promise<void>>(), skip: vi.fn(), finishPlay: () => {} }))

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
  collapseLabel: 'Свернуть',
  unmuteLabel: 'Включить звук',
  muteLabel: 'Выключить звук',
  scrollDownLabel: 'Прокрутить вниз',
}

const mounted: { unmount: () => void }[] = []

async function mountPlayer(props: Record<string, unknown> = {}) {
  const wrapper = await mountSuspended(IntroPlayer, {
    props: { ...LABELS, introTheme: 'nataskium-night', ...props },
    slots: { default: () => h('p', { class: 'game' }, 'Вопрос 1') },
  })
  mounted.push(wrapper)
  return wrapper
}

type Wrapper = Awaited<ReturnType<typeof mountPlayer>>

async function clickStart(wrapper: Wrapper) {
  await wrapper.find('.intro-player__start-button').trigger('click')
  await flushPromises()
  // Проигрыватель ждёт два кадра, пока устоится размер
  await new Promise((resolve) => setTimeout(resolve, 50))
  await flushPromises()
}

const ambience = (wrapper: Wrapper) => wrapper.find('.nataskium-ambience')

beforeEach(() => {
  vi.spyOn(window, 'matchMedia').mockReturnValue({ matches: false } as MediaQueryList)
  scene.play.mockImplementation(() => new Promise<void>((resolve) => (scene.finishPlay = resolve)))
})

afterEach(() => {
  for (const wrapper of mounted.splice(0)) wrapper.unmount()
  vi.restoreAllMocks()
  scene.play.mockReset()
  scene.skip.mockReset()
})

describe('IntroPlayer: живой фон темы', () => {
  it('на стартовом экране фон есть', async () => {
    const wrapper = await mountPlayer()
    expect(wrapper.find('.intro-player__start').exists()).toBe(true)
    expect(ambience(wrapper).exists()).toBe(true)
  })

  it('во время заставки фона нет, после неё в игре — снова есть', async () => {
    const wrapper = await mountPlayer()
    await clickStart(wrapper)
    expect(scene.play).toHaveBeenCalledOnce()
    expect(ambience(wrapper).exists()).toBe(false)

    scene.finishPlay()
    await flushPromises()
    expect(wrapper.find('.game').exists()).toBe(true)
    expect(ambience(wrapper).exists()).toBe(true)
  })

  it('«Пропустить» заставку — фон в игре есть', async () => {
    const wrapper = await mountPlayer()
    await clickStart(wrapper)
    await wrapper.get('.intro-player__skip').trigger('click')
    await flushPromises()
    expect(ambience(wrapper).exists()).toBe(true)
  })

  it('в игре фон лежит сразу за затемнением: над ним, но под игрой', async () => {
    const wrapper = await mountPlayer()
    await clickStart(wrapper)
    scene.finishPlay()
    await flushPromises()
    const scrim = wrapper.get('.intro-player__scrim').element
    expect(scrim.nextElementSibling).toBe(ambience(wrapper).element)
    const body = wrapper.get('.intro-player__body').element
    expect(ambience(wrapper).element.compareDocumentPosition(body) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('тон фона — по теме', async () => {
    const wrapper = await mountPlayer({ introTheme: 'nataskium-day' })
    expect(ambience(wrapper).classes()).toContain('nataskium-ambience--light')
  })

  it('без темы (ролик или статичная плата) фона нет', async () => {
    const wrapper = await mountPlayer({ introTheme: null })
    expect(ambience(wrapper).exists()).toBe(false)
    await clickStart(wrapper)
    expect(ambience(wrapper).exists()).toBe(false)
  })

  it('без интро (intro=false) — сразу игра с фоном', async () => {
    const wrapper = await mountPlayer({ intro: false })
    expect(wrapper.find('.game').exists()).toBe(true)
    expect(ambience(wrapper).exists()).toBe(true)
  })
})
