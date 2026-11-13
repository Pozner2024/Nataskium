import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

type NatSounds = typeof import('./natSounds')

const SOUNDS: (keyof NatSounds)[] = ['playGearSound', 'playBulbOnSound', 'playBulbOffSound', 'playGreetingSound']
const SAMPLE_RATE = 48000
const CURRENT_TIME_S = 2

let createdContexts: FakeAudioContext[]
let contextState: AudioContextState
let scheduledNodes: FakeScheduledNode[]
let oscillators: FakeOscillator[]

class FakeParam {
  setValueAtTime() {}

  exponentialRampToValueAtTime() {}
}

class FakeNode {
  gain = new FakeParam()
  frequency = new FakeParam()

  connect<T>(target: T) {
    return target
  }
}

class FakeScheduledNode extends FakeNode {
  startTime: number | null = null
  stopTime: number | null = null

  constructor() {
    super()
    scheduledNodes.push(this)
  }

  start(time: number) {
    this.startTime = time
  }

  stop(time: number) {
    this.stopTime = time
  }
}

class FakeOscillator extends FakeScheduledNode {
  constructor() {
    super()
    oscillators.push(this)
  }
}

class FakeAudioContext {
  state = contextState
  currentTime = CURRENT_TIME_S
  sampleRate = SAMPLE_RATE
  destination = new FakeNode()
  resume = vi.fn(async () => {})

  constructor() {
    createdContexts.push(this)
  }

  createBuffer(_channels: number, length: number) {
    const data = new Float32Array(length)
    return { getChannelData: () => data }
  }
}

function stubAudioApis() {
  vi.stubGlobal('window', { AudioContext: FakeAudioContext })
  vi.stubGlobal('AudioContext', FakeAudioContext)
  vi.stubGlobal('GainNode', FakeNode)
  vi.stubGlobal('BiquadFilterNode', FakeNode)
  vi.stubGlobal('OscillatorNode', FakeOscillator)
  vi.stubGlobal('AudioBufferSourceNode', FakeScheduledNode)
}

// Контекст кэшируется в модуле, поэтому каждый тест берёт свежую копию модуля
async function loadSounds(): Promise<NatSounds> {
  vi.resetModules()
  return import('./natSounds')
}

beforeEach(() => {
  createdContexts = []
  contextState = 'running'
  scheduledNodes = []
  oscillators = []
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('natSounds', () => {
  describe('без Web Audio', () => {
    it.each(SOUNDS)('%s на сервере (нет window) ничего не делает и не бросает', async name => {
      const sounds = await loadSounds()

      expect(() => sounds[name]()).not.toThrow()
    })

    it.each(SOUNDS)('%s в браузере без AudioContext ничего не делает и не бросает', async name => {
      vi.stubGlobal('window', {})
      const sounds = await loadSounds()

      expect(() => sounds[name]()).not.toThrow()
    })
  })

  describe('с Web Audio', () => {
    beforeEach(stubAudioApis)

    it('не создаёт AudioContext при загрузке модуля', async () => {
      await loadSounds()

      expect(createdContexts).toHaveLength(0)
    })

    it('создаёт один общий AudioContext на все звуки', async () => {
      const sounds = await loadSounds()

      for (const name of SOUNDS) sounds[name]()
      sounds.playGearSound()

      expect(createdContexts).toHaveLength(1)
    })

    it('возобновляет приостановленный контекст', async () => {
      contextState = 'suspended'
      const sounds = await loadSounds()

      sounds.playGreetingSound()

      expect(createdContexts[0]?.resume).toHaveBeenCalledOnce()
    })

    it('не возобновляет уже работающий контекст', async () => {
      const sounds = await loadSounds()

      sounds.playGreetingSound()

      expect(createdContexts[0]?.resume).not.toHaveBeenCalled()
    })

    it.each(SOUNDS)('%s запускает все созданные узлы не раньше текущего времени', async name => {
      const sounds = await loadSounds()

      sounds[name]()

      expect(scheduledNodes.length).toBeGreaterThan(0)
      for (const node of scheduledNodes) {
        expect(node.startTime).toBeGreaterThanOrEqual(CURRENT_TIME_S)
      }
    })

    it.each(SOUNDS)('%s останавливает каждый генератор тона после его запуска', async name => {
      const sounds = await loadSounds()

      sounds[name]()

      expect(oscillators.length).toBeGreaterThan(0)
      for (const oscillator of oscillators) {
        expect(oscillator.stopTime).toBeGreaterThan(oscillator.startTime ?? Infinity)
      }
    })
  })
})
