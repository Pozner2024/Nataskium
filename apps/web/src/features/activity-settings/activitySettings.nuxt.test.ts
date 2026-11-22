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
  introTheme: 'nataskium-night' as const,
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

describe('ActivitySettings: визуальный стиль', () => {
  it('у каждого стиля превью экрана вопроса с тоном темы, скрытое от скринридера, и название', async () => {
    const { wrapper } = await mountSettings()
    const styles = wrapper.findAll('.activity-settings__style')
    expect(styles.map((style) => style.get('.activity-settings__style-name').text())).toEqual(['Nataskium: ночь', 'Nataskium: день'])
    const previews = styles.map((style) => style.get('.intro-theme-preview'))
    expect(previews[0]!.classes()).toContain('intro-theme-preview--dark')
    expect(previews[1]!.classes()).toContain('intro-theme-preview--light')
    for (const preview of previews) expect(preview.attributes('aria-hidden')).toBe('true')
  })

  it('текущий стиль отмечен; выбор другого отправляет patch только с introTheme', async () => {
    const { wrapper, save } = await mountSettings()
    const radios = wrapper.findAll<HTMLInputElement>('input[name="quiz-style"]')
    expect(radios.map((radio) => radio.element.checked)).toEqual([true, false])

    await radios[1]!.setValue(true)

    expect(save).toHaveBeenCalledWith({ introTheme: 'nataskium-day' })
  })

  it('сохранить не удалось — отметка возвращается на прежний стиль', async () => {
    const { wrapper, save } = await mountSettings(BASE, { save: async () => false })
    const radios = wrapper.findAll<HTMLInputElement>('input[name="quiz-style"]')

    await radios[1]!.setValue(true)
    await flushPromises()

    expect(save).toHaveBeenCalledOnce()
    expect(radios.map((radio) => radio.element.checked)).toEqual([true, false])
  })

  it('disabled — стили не выбрать', async () => {
    const { wrapper } = await mountSettings(BASE, { disabled: true })
    for (const radio of wrapper.findAll('input[name="quiz-style"]')) expect(radio.attributes('disabled')).toBeDefined()
  })
})
