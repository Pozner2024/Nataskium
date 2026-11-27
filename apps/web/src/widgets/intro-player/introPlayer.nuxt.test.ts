import { mountSuspended } from '@nuxt/test-utils/runtime'
import { flushPromises } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h, inject, type Ref } from 'vue'
import { PLAYER_SCROLL_KEY } from '@/features/play-session'
import IntroPlayer from './IntroPlayer.vue'

const LABELS = {
  typeLabel: 'Викторина',
  title: 'Столицы',
  hint: 'Выберите ответ',
  startLabel: 'Начать',
  skipLabel: 'Пропустить',
  enterFullscreenLabel: 'На весь экран',
  exitFullscreenLabel: 'Выйти',
  scrollDownLabel: 'Прокрутить вниз',
  unmuteLabel: 'Звук вкл',
  muteLabel: 'Звук выкл',
}

const VIDEO = '/intro.mp4'
const mounted: { unmount: () => void }[] = []
let injectedScroll: Readonly<Ref<HTMLElement | null>> | null | undefined

// Слот-пробник: достаёт то, что проигрыватель отдаёт игре
const Game = defineComponent({
  setup() {
    injectedScroll = inject(PLAYER_SCROLL_KEY, null)
    return () => h('p', { class: 'game' }, 'игра')
  },
})

async function mountPlayer(props: Record<string, unknown> = {}) {
  const wrapper = await mountSuspended(IntroPlayer, {
    props: { ...LABELS, ...props },
    slots: { default: () => h(Game) },
  })
  mounted.push(wrapper)
  await flushPromises()
  return wrapper
}

beforeEach(() => {
  injectedScroll = undefined
  // happy-dom не играет видео: подменяем play/pause
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined)
  vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => undefined)
})

afterEach(() => {
  for (const wrapper of mounted.splice(0)) wrapper.unmount()
  vi.restoreAllMocks()
})

describe('IntroPlayer: фазы', () => {
  it('старт: название и «Начать», слот с игрой не смонтирован', async () => {
    const wrapper = await mountPlayer({ src: VIDEO })

    expect(wrapper.get('.intro-player__title').text()).toBe('Столицы')
    expect(wrapper.get('.intro-player__start-button').text()).toBe('Начать')
    expect(wrapper.find('.game').exists()).toBe(false)
    expect(wrapper.emitted('done')).toBeUndefined()
  })

  it('«Начать» с роликом: фаза playing, слота ещё нет, есть «Пропустить» и управление звуком', async () => {
    const wrapper = await mountPlayer({ src: VIDEO })
    await wrapper.get('.intro-player__start-button').trigger('click')
    await flushPromises()

    expect(wrapper.find('.intro-player__start').exists()).toBe(false)
    expect(wrapper.find('.game').exists()).toBe(false)
    expect(wrapper.get('.intro-player__skip').text()).toContain('Пропустить')
    expect(wrapper.find('.intro-player__control').exists()).toBe(true)
    expect(HTMLMediaElement.prototype.play).toHaveBeenCalled()
  })

  it('«Пропустить» во время ролика: done, слот показан, ролик остановлен', async () => {
    const wrapper = await mountPlayer({ src: VIDEO })
    await wrapper.get('.intro-player__start-button').trigger('click')
    await flushPromises()
    await wrapper.get('.intro-player__skip').trigger('click')
    await flushPromises()

    expect(wrapper.find('.game').exists()).toBe(true)
    expect(wrapper.emitted('done')).toHaveLength(1)
    expect(HTMLMediaElement.prototype.pause).toHaveBeenCalled()
    expect(wrapper.find('.intro-player__skip').exists()).toBe(false)
  })

  it('конец ролика (ended): done, слот показан, done один раз', async () => {
    const wrapper = await mountPlayer({ src: VIDEO })
    await wrapper.get('.intro-player__start-button').trigger('click')
    await flushPromises()
    await wrapper.get('video').trigger('ended')
    await wrapper.get('video').trigger('ended')
    await flushPromises()

    expect(wrapper.find('.game').exists()).toBe(true)
    expect(wrapper.emitted('done')).toHaveLength(1)
  })

  it('ошибка ролика во время просмотра: переход в done', async () => {
    const wrapper = await mountPlayer({ src: VIDEO })
    await wrapper.get('.intro-player__start-button').trigger('click')
    await flushPromises()
    await wrapper.get('video').trigger('error')
    await flushPromises()

    expect(wrapper.find('.game').exists()).toBe(true)
  })

  it('без src «Начать» ведёт сразу в done, без фазы playing', async () => {
    const wrapper = await mountPlayer()
    expect(wrapper.find('video').exists()).toBe(false)

    await wrapper.get('.intro-player__start-button').trigger('click')
    await flushPromises()

    expect(wrapper.find('.game').exists()).toBe(true)
    expect(wrapper.find('.intro-player__skip').exists()).toBe(false)
    expect(wrapper.emitted('done')).toHaveLength(1)
  })

  it('ошибка ролика до «Начать»: «Начать» ведёт сразу в done', async () => {
    const wrapper = await mountPlayer({ src: VIDEO })
    await wrapper.get('video').trigger('error')
    await wrapper.get('.intro-player__start-button').trigger('click')
    await flushPromises()

    expect(wrapper.find('.game').exists()).toBe(true)
  })

  it('intro=false: сразу done, без стартового экрана и «Пропустить»', async () => {
    const wrapper = await mountPlayer({ intro: false })

    expect(wrapper.find('.intro-player__start').exists()).toBe(false)
    expect(wrapper.find('.intro-player__skip').exists()).toBe(false)
    expect(wrapper.find('.game').exists()).toBe(true)
  })
})

describe('IntroPlayer: «Пропустить» на стартовом экране', () => {
  it('без skippable кнопки на старте нет', async () => {
    const wrapper = await mountPlayer({ src: VIDEO })
    expect(wrapper.find('.intro-player__skip').exists()).toBe(false)
  })

  it('со skippable «Пропустить» на старте ведёт в done: слот показан, ролик не играл', async () => {
    const wrapper = await mountPlayer({ src: VIDEO, skippable: true })
    expect(wrapper.find('.game').exists()).toBe(false)

    await wrapper.get('.intro-player__skip').trigger('click')
    await flushPromises()

    expect(wrapper.find('.game').exists()).toBe(true)
    expect(wrapper.find('.intro-player__start').exists()).toBe(false)
    expect(wrapper.emitted('done')).toHaveLength(1)
    expect(HTMLMediaElement.prototype.play).not.toHaveBeenCalled()
  })

  it('со skippable и без src «Пропустить» тоже ведёт в done', async () => {
    const wrapper = await mountPlayer({ skippable: true })
    await wrapper.get('.intro-player__skip').trigger('click')
    await flushPromises()

    expect(wrapper.find('.game').exists()).toBe(true)
  })
})

describe('IntroPlayer: контекст для игры', () => {
  it('provide PLAYER_SCROLL_KEY: игра получает прокручиваемый слот проигрывателя', async () => {
    const wrapper = await mountPlayer({ intro: false })

    expect(injectedScroll).toBeDefined()
    expect(injectedScroll?.value).toBe(wrapper.get('.intro-player__content').element)
  })

  it('слот тулбара виден на всех фазах', async () => {
    const wrapper = await mountSuspended(IntroPlayer, {
      props: { ...LABELS, src: VIDEO },
      slots: { toolbar: () => h('button', { class: 'back' }, 'Назад'), default: () => h(Game) },
    })
    mounted.push(wrapper)
    await flushPromises()
    expect(wrapper.find('.intro-player__toolbar .back').exists()).toBe(true)

    await wrapper.get('.intro-player__start-button').trigger('click')
    await flushPromises()
    expect(wrapper.find('.intro-player__toolbar .back').exists()).toBe(true)
  })
})

describe('IntroPlayer: стрелка «ниже ещё есть»', () => {
  async function mountScrollable(reducedMotion: boolean) {
    vi.spyOn(window, 'matchMedia').mockReturnValue({ matches: reducedMotion } as MediaQueryList)
    const wrapper = await mountPlayer({ intro: false })
    const content = wrapper.get('.intro-player__content').element as HTMLElement
    Object.defineProperty(content, 'scrollHeight', { configurable: true, value: 900 })
    Object.defineProperty(content, 'clientHeight', { configurable: true, value: 400 })
    content.scrollTo = vi.fn() as typeof content.scrollTo
    content.focus = vi.fn()
    await wrapper.get('.intro-player__content').trigger('scroll')
    return { wrapper, content }
  }

  it('нажатие плавно прокручивает слот до конца и переводит фокус на слот', async () => {
    const { wrapper, content } = await mountScrollable(false)

    const button = wrapper.get('.intro-player__more-button')
    expect(button.attributes('aria-label')).toBe('Прокрутить вниз')
    await button.trigger('click')

    expect(content.scrollTo).toHaveBeenCalledWith({ top: 900, behavior: 'smooth' })
    expect(content.focus).toHaveBeenCalledWith({ preventScroll: true })
  })

  it('при reduced-motion прокрутка без анимации', async () => {
    const { wrapper, content } = await mountScrollable(true)

    await wrapper.get('.intro-player__more-button').trigger('click')

    expect(content.scrollTo).toHaveBeenCalledWith({ top: 900, behavior: 'auto' })
  })

  it('содержимое помещается: стрелки нет', async () => {
    const wrapper = await mountPlayer({ intro: false })

    expect(wrapper.find('.intro-player__more-button').exists()).toBe(false)
  })
})
