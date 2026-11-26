import { mountSuspended } from '@nuxt/test-utils/runtime'
import { describe, expect, it } from 'vitest'
import ActivityTypePicker from './ActivityTypePicker.vue'

describe('ActivityTypePicker', () => {
  it('показывает три типа по порядку', async () => {
    const wrapper = await mountSuspended(ActivityTypePicker)

    const names = wrapper.findAll('.game-type-card__name').map((item) => item.text())
    expect(names).toEqual(['Викторина', 'Сопоставление', 'Да/нет'])
  })

  it('клик по карточке отдаёт тип', async () => {
    const wrapper = await mountSuspended(ActivityTypePicker)

    await wrapper.findAll('button.game-type-card')[2]?.trigger('click')

    expect(wrapper.emitted('select')).toEqual([['truefalse']])
  })
})
