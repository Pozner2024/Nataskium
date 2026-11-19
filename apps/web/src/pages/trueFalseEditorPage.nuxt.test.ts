import { mockNuxtImport, mountSuspended } from '@nuxt/test-utils/runtime'
import { flushPromises } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import TrueFalseEditorPage from './TrueFalseEditorPage.vue'

const WORD_JOINER = String.fromCodePoint(0x2060)

const { useSeoMetaMock } = vi.hoisted(() => ({ useSeoMetaMock: vi.fn() }))
mockNuxtImport('useSeoMeta', () => useSeoMetaMock)

describe('TrueFalseEditorPage: заголовок', () => {
  it('h1 содержит невидимый соединитель слов, заголовок вкладки — нет', async () => {
    const wrapper = await mountSuspended(TrueFalseEditorPage)
    await flushPromises()

    const { title } = useSeoMetaMock.mock.calls[0]![0] as { title: () => string }
    expect(wrapper.find('h1').text()).toContain(WORD_JOINER)
    expect(title()).not.toBe('')
    expect(title()).not.toContain(WORD_JOINER)
    wrapper.unmount()
  })
})
