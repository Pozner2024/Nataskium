import { mountSuspended } from '@nuxt/test-utils/runtime'
import { flushPromises } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { libraryApi } from '@/entities/library'
import ActivitySettings from './ActivitySettings.vue'

const SETTINGS = { group: '', showAnswers: true, gradingScale: null, timer: { mode: 'none' as const } }
const mounted: { unmount: () => void }[] = []

async function mountKind(kind?: 'quiz' | 'matching') {
  const wrapper = await mountSuspended(ActivitySettings, {
    props: { settings: SETTINGS, disabled: false, save: async () => true, ...(kind ? { kind } : {}) },
  })
  mounted.push(wrapper)
  await flushPromises()
  return wrapper
}

beforeEach(() => {
  vi.spyOn(libraryApi, 'groups').mockResolvedValue({ groups: [] } as never)
})

afterEach(() => {
  for (const wrapper of mounted.splice(0)) wrapper.unmount()
  vi.restoreAllMocks()
})

describe('ActivitySettings: подсказки по типу задания', () => {
  it('по умолчанию — подсказки викторины', async () => {
    const wrapper = await mountKind()

    expect(wrapper.get('#quiz-show-answers-hint').text()).toContain('после каждого ответа')
    expect(wrapper.get('#quiz-grading-hint').text()).toContain('правильных ответов')
  })

  it('сопоставление — одна проверка в конце и проценты правильных пар', async () => {
    const wrapper = await mountKind('matching')

    expect(wrapper.get('#quiz-show-answers-hint').text()).toBe(
      'Включено: после проверки ученик видит, какие пары верные, и правильное слово к каждой неверной. Выключено: только процент и оценка.',
    )
    expect(wrapper.get('#quiz-grading-hint').text()).toBe('Оценка считается только по проценту правильных пар. Выберите шкалу.')
  })
})
