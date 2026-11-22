import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises } from '@vue/test-utils'
import { createNataskiumSound } from './sound'

// Подмена Web Audio: проверяется, когда звук играет, а не сам звук
function fakeAudio() {
  const started: number[] = []
  const stopped: number[] = []
  const gains: Array<{ gain: { value: number } }> = []
  let created = 0
  class FakeAudioContext {
    destination = {}
    constructor() {
      created++
    }
    resume = vi.fn(async () => {})
    close = vi.fn(async () => {})
    decodeAudioData = vi.fn(async () => ({}))
    createGain() {
      const node = { gain: { value: 1 }, connect: (target: unknown) => target }
      gains.push(node)
      return node
    }
    createBufferSource() {
      const id = started.length + stopped.length + Math.random()
      return {
        buffer: null as unknown,
        onended: null as unknown,
        connect: (target: unknown) => target,
        start: () => started.push(id),
        stop: () => stopped.push(id),
      }
    }
  }
  return { FakeAudioContext, started, stopped, gains, created: () => created }
}

describe('звуки темы Nataskium', () => {
  let audio: ReturnType<typeof fakeAudio>

  beforeEach(() => {
    audio = fakeAudio()
    vi.stubGlobal('AudioContext', audio.FakeAudioContext)
    vi.stubGlobal('fetch', vi.fn(async () => ({ arrayBuffer: async () => new ArrayBuffer(8) })))
  })

  afterEach(() => vi.unstubAllGlobals())

  it('до «Начать» (unlock) звук не играет и аудио не создаётся', () => {
    const sound = createNataskiumSound()
    sound.play('head')
    expect(audio.created()).toBe(0)
    expect(audio.started).toHaveLength(0)
  })

  it('после unlock звуки загружаются и играют', async () => {
    const sound = createNataskiumSound()
    sound.unlock()
    await flushPromises()
    sound.play('head')
    sound.play('letter')
    expect(audio.started).toHaveLength(2)
  })

  it('выключенный звук глушится общей громкостью', async () => {
    const sound = createNataskiumSound()
    sound.unlock()
    await flushPromises()
    sound.setMuted(true)
    expect(audio.gains[0]?.gain.value).toBe(0)
  })

  it('«Пропустить» (stop) обрывает звучащее, а звуки игры после него играют', async () => {
    const sound = createNataskiumSound()
    sound.unlock()
    await flushPromises()
    sound.play('signal')
    sound.stop()
    sound.play('frame')
    expect(audio.stopped).toHaveLength(1)
    expect(audio.started).toHaveLength(2)
  })

  it('после ухода со страницы (dispose) звуки не играют', async () => {
    const sound = createNataskiumSound()
    sound.unlock()
    await flushPromises()
    sound.dispose()
    sound.play('frame')
    expect(audio.started).toHaveLength(0)
  })
})
