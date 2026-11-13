import { mountSuspended } from '@nuxt/test-utils/runtime'
import { describe, expect, it } from 'vitest'
import { PCB_TRAIL_POINTS } from '../lib/pcbGlow'
import PcbGlow from './PcbGlow.vue'

describe('PcbGlow', () => {
  it('один слой шлейфа на зону, скрыт от вспомогательных технологий', async () => {
    const wrapper = await mountSuspended(PcbGlow)

    expect(wrapper.attributes('aria-hidden')).toBe('true')
    expect(wrapper.findAll('.pcb-glow__trail')).toHaveLength(1)
  })

  it('маска собрана из головы и всех точек шлейфа (PCB_TRAIL_POINTS)', async () => {
    const wrapper = await mountSuspended(PcbGlow)

    const mask = wrapper.find('.pcb-glow__trail').attributes('style') ?? ''
    // Голова + точки следа: по одной радиальной заливке на каждую
    expect(mask.split('radial-gradient(').length - 1).toBe(PCB_TRAIL_POINTS + 1)
    for (let index = 0; index < PCB_TRAIL_POINTS; index++) {
      expect(mask).toContain(`--pcb-trail-${index}-x`)
    }
  })
})
