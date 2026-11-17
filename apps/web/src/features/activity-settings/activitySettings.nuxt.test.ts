import { mountSuspended } from '@nuxt/test-utils/runtime'
import { flushPromises } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_TIME_LIMIT_SECONDS } from '@nataskium/shared/schemas'
import { libraryApi } from '@/entities/library'
import ActivitySettings from './ActivitySettings.vue'
import type { ActivitySettingsValue } from './types'

const GROUPS = [
  { slug: 'other', names: { ru: 'Разное', en: 'Other', de: 'Anderes', fr: 'Autre' } },
  { slug: 'exact', names: { ru: 'Точные науки', en: 'Exact', de: 'Exakt', fr: 'Exactes' } },
]

const BASE: ActivitySettingsValue = {
  group: 'other',
  showAnswers: true,
  gradingScale: null,
  timer: { mode: 'none' },
}

const mounted: { unmount: () => void }[] = []

beforeEach(() => {
  vi.restoreAllMocks()
  vi.spyOn(libraryApi, 'groups').mockResolvedValue({ groups: GROUPS } as never)
})

afterEach(() => {
  for (const wrapper of mounted.splice(0)) wrapper.unmount()
})

async function mountSettings(
  settings: ActivitySettingsValue = BASE,
  options: { disabled?: boolean; save?: (patch: Partial<ActivitySettingsValue>) => Promise<boolean> } = {},
) {
  const save = vi.fn(options.save ?? (async () => true))
  const wrapper = await mountSuspended(ActivitySettings, {
    props: { settings, disabled: options.disabled ?? false, save },
  })
  mounted.push(wrapper)
  await flushPromises()
  return { wrapper, save }
}

function switchOf(wrapper: Awaited<ReturnType<typeof mountSettings>>['wrapper'], id: string) {
  return wrapper.find(`#${id}`)
}

describe('ActivitySettings: сохранение изменений', () => {
  it('переключатель «показывать ответы» отправляет patch только с showAnswers', async () => {
    const { wrapper, save } = await mountSettings()

    await switchOf(wrapper, 'quiz-show-answers').setValue(false)

    expect(save).toHaveBeenCalledWith({ showAnswers: false })
  })

  it('смена группы отправляет patch с group', async () => {
    const { wrapper, save } = await mountSettings()

    await wrapper.find('#quiz-group').setValue('exact')

    expect(save).toHaveBeenCalledWith({ group: 'exact' })
  })

  it('таймер: none → stopwatch отправляет patch с mode stopwatch', async () => {
    const { wrapper, save } = await mountSettings()

    await wrapper.find('input[name="quiz-timer"][value="stopwatch"]').trigger('change')

    expect(save).toHaveBeenCalledWith({ timer: { mode: 'stopwatch' } })
  })

  it('таймер: none → limit отправляет лимит по умолчанию', async () => {
    const { wrapper, save } = await mountSettings()

    await wrapper.find('input[name="quiz-timer"][value="limit"]').trigger('change')

    expect(save).toHaveBeenCalledWith({ timer: { mode: 'limit', seconds: DEFAULT_TIME_LIMIT_SECONDS } })
  })

  it('таймер: limit → none отправляет mode none без секунд', async () => {
    const { wrapper, save } = await mountSettings({ ...BASE, timer: { mode: 'limit', seconds: 600 } })

    await wrapper.find('input[name="quiz-timer"][value="none"]').trigger('change')

    expect(save).toHaveBeenCalledWith({ timer: { mode: 'none' } })
  })

  it('минуты лимита: 5 → 300 секунд; 0 и дробное — ошибка без сохранения', async () => {
    const { wrapper, save } = await mountSettings({ ...BASE, timer: { mode: 'limit', seconds: 600 } })
    const minutes = wrapper.find('#quiz-time-limit')

    await minutes.setValue('5')
    await minutes.trigger('change')
    expect(save).toHaveBeenLastCalledWith({ timer: { mode: 'limit', seconds: 300 } })

    save.mockClear()
    await minutes.setValue('0')
    await minutes.trigger('change')
    expect(save).not.toHaveBeenCalled()
    expect(wrapper.find('#quiz-time-limit-error').exists()).toBe(true)

    await minutes.setValue('2.5')
    await minutes.trigger('change')
    expect(save).not.toHaveBeenCalled()
  })
})

describe('ActivitySettings: отключённое состояние', () => {
  it('disabled — все поля заблокированы и не отправляют изменения', async () => {
    const { wrapper, save } = await mountSettings({ ...BASE, timer: { mode: 'limit', seconds: 600 } }, { disabled: true })

    for (const selector of ['#quiz-show-answers', '#quiz-grading', '#quiz-group', 'input[name="quiz-timer"]', '#quiz-time-limit']) {
      for (const element of wrapper.findAll(selector)) expect(element.attributes('disabled'), selector).toBeDefined()
    }

    await switchOf(wrapper, 'quiz-show-answers').trigger('change')
    expect(save).not.toHaveBeenCalled()
  })
})

describe('ActivitySettings: откат при неудачном сохранении', () => {
  it('оценка: закрытие шкалы при неудаче возвращает переключатель в «открыто»', async () => {
    const { wrapper } = await mountSettings({ ...BASE, gradingScale: 'five' }, { save: async () => false })

    await switchOf(wrapper, 'quiz-grading').setValue(false)
    await flushPromises()

    expect((switchOf(wrapper, 'quiz-grading').element as HTMLInputElement).checked).toBe(true)
  })

  it('«показывать ответы»: при неудаче переключатель возвращается в прежнее положение', async () => {
    const { wrapper } = await mountSettings(BASE, { save: async () => false })

    await switchOf(wrapper, 'quiz-show-answers').setValue(false)
    await flushPromises()

    expect((switchOf(wrapper, 'quiz-show-answers').element as HTMLInputElement).checked).toBe(true)
  })
})
