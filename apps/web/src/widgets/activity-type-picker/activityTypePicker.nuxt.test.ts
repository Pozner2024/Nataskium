import { mountSuspended } from '@nuxt/test-utils/runtime'
import { describe, expect, it } from 'vitest'
import ActivityTypePicker from './ActivityTypePicker.vue'

describe('ActivityTypePicker', () => {
  it('показывает пять плиток по порядку', async () => {
    const wrapper = await mountSuspended(ActivityTypePicker)

    const names = wrapper.findAll('.activity-type-picker__name').map((item) => item.text())
    expect(names).toEqual(['Викторина', 'Сопоставление', 'Да/нет', 'Пропуски', 'Картинки'])
  })

  it('клик по плитке отдаёт тип', async () => {
    const wrapper = await mountSuspended(ActivityTypePicker)

    await wrapper.findAll('.activity-type-picker__tile')[2]?.trigger('click')

    expect(wrapper.emitted('select')).toEqual([['truefalse']])
  })
})
