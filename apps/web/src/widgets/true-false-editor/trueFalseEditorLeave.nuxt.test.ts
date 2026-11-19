import { mountSuspended } from '@nuxt/test-utils/runtime'
import { flushPromises } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { useAuthStore } from '@/features/auth'
import TrueFalseEditor from './TrueFalseEditor.vue'
import { useTrueFalseEditorStore } from './store'

const TEACHER = { id: 't1', email: 'qa-anna@example.test', displayName: 'Анна', hasPassword: true, hasGoogle: false }
const mounted: { unmount: () => void }[] = []

beforeEach(() => {
  useAuthStore().setSession({ accessToken: 'access-1', teacher: TEACHER })
})

afterEach(() => {
  for (const wrapper of mounted.splice(0)) wrapper.unmount()
})

describe('Редактор «да/нет»: предупреждение о несохранённых изменениях', () => {
  it('beforeunload отменяется только при несохранённых правках', async () => {
    const wrapper = await mountSuspended(TrueFalseEditor, { attachTo: document.body })
    mounted.push(wrapper)
    await flushPromises()

    const clean = new Event('beforeunload', { cancelable: true })
    window.dispatchEvent(clean)
    expect(clean.defaultPrevented).toBe(false)

    useTrueFalseEditorStore().trueFalse.title = 'Правка'
    const dirty = new Event('beforeunload', { cancelable: true })
    window.dispatchEvent(dirty)
    expect(dirty.defaultPrevented).toBe(true)
  })

  it('после размонтирования обработчик beforeunload снят', async () => {
    const wrapper = await mountSuspended(TrueFalseEditor, { attachTo: document.body })
    await flushPromises()
    useTrueFalseEditorStore().trueFalse.title = 'Правка'
    wrapper.unmount()

    const event = new Event('beforeunload', { cancelable: true })
    window.dispatchEvent(event)

    expect(event.defaultPrevented).toBe(false)
  })
})
