import { mountSuspended } from '@nuxt/test-utils/runtime'
import type { VueWrapper } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { NatBulb, NatCards, NatGear } from '@/shared'
import { playBulbOffSound, playBulbOnSound, playGearSound, playGreetingSound } from '../lib/natSounds'

vi.mock('../lib/natSounds', () => ({
  playGearSound: vi.fn(),
  playBulbOnSound: vi.fn(),
  playBulbOffSound: vi.fn(),
  playGreetingSound: vi.fn(),
}))

let wrapper: VueWrapper

beforeEach(() => {
  vi.stubGlobal('matchMedia', () => ({ matches: true }))
  vi.stubGlobal('requestAnimationFrame', () => 0)
  vi.stubGlobal('cancelAnimationFrame', () => {})
  vi.stubGlobal('IntersectionObserver', class {
    observe() {}

    disconnect() {}
  })
})

afterEach(() => {
  wrapper.unmount()
  vi.unstubAllGlobals()
  vi.clearAllMocks()
})

async function press() {
  await wrapper.find('.nat-robot').trigger('click')
}

describe('звуки сцен Ната', () => {
  it('сцены не играют звук без нажатия', async () => {
    wrapper = await mountSuspended(NatGear)

    expect(playGearSound).not.toHaveBeenCalled()
  })

  it('шестерёнка по нажатию играет звук шестерёнок', async () => {
    wrapper = await mountSuspended(NatGear)
    await press()

    expect(playGearSound).toHaveBeenCalledOnce()
  })

  it('карточки по нажатию играют приветствие', async () => {
    wrapper = await mountSuspended(NatCards)
    await press()

    expect(playGreetingSound).toHaveBeenCalledOnce()
  })

  describe('лампочка', () => {
    it('при включении играет звук включения', async () => {
      wrapper = await mountSuspended(NatBulb)
      await press()

      expect(wrapper.find('.nat-robot').attributes('aria-pressed')).toBe('true')
      expect(playBulbOnSound).toHaveBeenCalledOnce()
      expect(playBulbOffSound).not.toHaveBeenCalled()
    })

    it('при выключении играет звук выключения', async () => {
      wrapper = await mountSuspended(NatBulb)
      await press()
      await press()

      expect(wrapper.find('.nat-robot').attributes('aria-pressed')).toBe('false')
      expect(playBulbOnSound).toHaveBeenCalledOnce()
      expect(playBulbOffSound).toHaveBeenCalledOnce()
    })
  })
})
