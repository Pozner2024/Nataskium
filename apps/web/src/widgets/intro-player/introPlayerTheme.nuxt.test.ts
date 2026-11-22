import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h } from 'vue'
import { flushPromises } from '@vue/test-utils'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import { IntroPlayer } from '@/widgets/intro-player'

// Сцена темы подменена: проверяется, как проигрыватель ведёт фазы, а не сама анимация
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

function mountPlayer(introTheme: string | null) {
  return mountSuspended(IntroPlayer, {
    props: { ...LABELS, introTheme },
    slots: { default: () => h('p', { class: 'game' }, 'Вопрос 1') },
  })
}

function prefersReducedMotion(reduce: boolean) {
  vi.spyOn(window, 'matchMedia').mockReturnValue({ matches: reduce } as MediaQueryList)
}

async function clickStart(wrapper: Awaited<ReturnType<typeof mountPlayer>>) {
  await wrapper.find('.intro-player__start-button').trigger('click')
  await flushPromises()
  // Проигрыватель ждёт два кадра, пока устоится размер
  await new Promise((resolve) => setTimeout(resolve, 50))
  await flushPromises()
}

describe('IntroPlayer: тема кодом', () => {
  beforeEach(() => {
    prefersReducedMotion(false)
    scene.play.mockImplementation(() => new Promise<void>((resolve) => (scene.finishPlay = resolve)))
  })

  afterEach(() => {
    vi.restoreAllMocks()
    scene.play.mockReset()
    scene.skip.mockReset()
  })

  it('без темы всё по-старому: статичная плата, сцены нет', async () => {
    const wrapper = await mountPlayer(null)
    expect(wrapper.find('.intro-player__pcb').exists()).toBe(true)
    expect(wrapper.find('.scene-stub').exists()).toBe(false)
  })

  it('с темой: сцена вместо статичной платы и ролика', async () => {
    const wrapper = await mountPlayer('nataskium-night')
    expect(wrapper.find('.scene-stub').exists()).toBe(true)
    expect(wrapper.find('.intro-player__pcb').exists()).toBe(false)
    expect(wrapper.find('video').exists()).toBe(false)
  })

  it('«Начать» играет интро, игра появляется только на чистой сцене', async () => {
    const wrapper = await mountPlayer('nataskium-night')
    await clickStart(wrapper)
    expect(scene.play).toHaveBeenCalledTimes(1)
    expect(wrapper.find('.game').exists()).toBe(false)

    scene.finishPlay()
    await flushPromises()
    expect(wrapper.find('.game').exists()).toBe(true)
    expect(wrapper.emitted('done')).toHaveLength(1)
  })

  it('«Пропустить» во время интро сразу открывает игру', async () => {
    const wrapper = await mountPlayer('nataskium-night')
    await clickStart(wrapper)
    await wrapper.find('.intro-player__skip').trigger('click')
    await flushPromises()
    expect(scene.skip).toHaveBeenCalledTimes(1)
    expect(wrapper.find('.game').exists()).toBe(true)
    expect(wrapper.emitted('done')).toHaveLength(1)
  })

  it('при prefers-reduced-motion «Начать» сразу открывает игру без интро', async () => {
    prefersReducedMotion(true)
    const wrapper = await mountPlayer('nataskium-night')
    await wrapper.find('.intro-player__start-button').trigger('click')
    await flushPromises()
    expect(scene.play).not.toHaveBeenCalled()
    expect(wrapper.find('.game').exists()).toBe(true)
  })

  it('тема «день» включает светлую палитру игры', async () => {
    const wrapper = await mountPlayer('nataskium-day')
    expect(wrapper.find('.intro-player').classes()).toContain('intro-player--light')
  })

  it('во время интро темы есть кнопка звука: выключает и включает звук', async () => {
    const wrapper = await mountPlayer('nataskium-night')
    await clickStart(wrapper)
    await wrapper.get('[aria-label="Выключить звук"]').trigger('click')
    expect(wrapper.find('[aria-label="Включить звук"]').exists()).toBe(true)
  })
})
