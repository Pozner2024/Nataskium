import { mountSuspended } from '@nuxt/test-utils/runtime'
import { MAX_QUIZZES_PER_TEACHER } from '@nataskium/shared/schemas'
import { flushPromises, type VueWrapper } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'
import { ApiError, NETWORK_ERROR_STATUS } from '@/shared'
import TakeLibraryQuizButton from './TakeLibraryQuizButton.vue'
import type { TakenQuiz } from './types'

const QUIZ_ID = '0b6a9c1e-7f3d-4a52-9e1b-3c5d7f9a1b2c'

type Props = { isSignedIn?: boolean; isReady?: boolean; take?: () => Promise<TakenQuiz> }

let wrapper: VueWrapper

async function mountButton(props: Props = {}, route?: string) {
  const take = vi.fn(props.take ?? (() => Promise.resolve({ quizId: QUIZ_ID })))
  wrapper = await mountSuspended(TakeLibraryQuizButton, {
    props: { isSignedIn: props.isSignedIn ?? true, isReady: props.isReady ?? true, take },
    route,
  })
  return take
}

function button() {
  return wrapper.find('button.app-button')
}

async function click() {
  await button().trigger('click')
  await flushPromises()
}

afterEach(() => {
  wrapper.unmount()
})

describe('TakeLibraryQuizButton', () => {
  it('сессия не проверена: кнопка выключена и клик не запускает копирование', async () => {
    const take = await mountButton({ isReady: false })

    expect(button().attributes('disabled')).toBeDefined()
    await click()

    expect(take).not.toHaveBeenCalled()
    expect(wrapper.emitted('login-required')).toBeUndefined()
  })

  it('сессия проверена: кнопка включена, текст «Взять себе», сообщений нет', async () => {
    await mountButton()

    expect(button().attributes('disabled')).toBeUndefined()
    expect(button().text()).toBe('Взять себе')
    expect(wrapper.find('[role="status"]').text()).toBe('')
    expect(wrapper.find('[role="alert"]').exists()).toBe(false)
  })

  it('во время копирования: «Копируем…», кнопка выключена, статус для чтеца', async () => {
    await mountButton({ take: () => new Promise(() => {}) })

    await click()

    expect(button().text()).toBe('Копируем…')
    expect(button().attributes('disabled')).toBeDefined()
    expect(wrapper.find('[role="status"]').text()).toBe('Копируем…')
  })

  it('после успеха: «Готово!…», кнопка остаётся выключенной, emit taken с id копии', async () => {
    await mountButton()

    await click()

    expect(button().text()).toBe('Готово! Открываем вашу копию…')
    expect(button().attributes('disabled')).toBeDefined()
    expect(wrapper.find('[role="status"]').text()).toBe('Готово! Открываем вашу копию…')
    expect(wrapper.emitted('taken')).toEqual([[QUIZ_ID]])
  })

  it('на английском тексты на английском', async () => {
    await mountButton({}, '/en/library/quiz/12')

    expect(button().text()).toBe('Take for myself')
    await click()
    expect(button().text()).toBe('Done! Opening your copy…')
  })

  it('гость: login-required, копирование не вызвано, кнопка остаётся включённой', async () => {
    const take = await mountButton({ isSignedIn: false })

    await click()

    expect(take).not.toHaveBeenCalled()
    expect(wrapper.emitted('login-required')).toHaveLength(1)
    expect(wrapper.emitted('taken')).toBeUndefined()
    expect(button().attributes('disabled')).toBeUndefined()
    expect(wrapper.find('[role="alert"]').exists()).toBe(false)
  })

  it('401 при копировании: login-required, без сообщения об ошибке', async () => {
    await mountButton({ take: () => Promise.reject(new ApiError(401)) })

    await click()

    expect(wrapper.emitted('login-required')).toHaveLength(1)
    expect(wrapper.emitted('taken')).toBeUndefined()
    expect(wrapper.find('[role="alert"]').exists()).toBe(false)
    expect(button().attributes('disabled')).toBeUndefined()
  })

  it('двойной клик: копирование вызвано один раз', async () => {
    const take = await mountButton({ take: () => new Promise(() => {}) })

    await button().trigger('click')
    await button().trigger('click')
    await flushPromises()

    expect(take).toHaveBeenCalledTimes(1)
  })

  describe('ошибки', () => {
    const TEXTS: [number, string][] = [
      [409, `Достигнут лимит: не больше ${MAX_QUIZZES_PER_TEACHER} заданий. Удалите ненужные в «Моих заданиях» и попробуйте снова`],
      [503, 'Не получилось скопировать картинки: хранилище временно недоступно. Попробуйте через несколько минут'],
      [429, 'Слишком много попыток. Подождите немного и нажмите ещё раз'],
      [NETWORK_ERROR_STATUS, 'Нет связи с сервером. Проверьте интернет и нажмите ещё раз. Если задание уже скопировалось, оно в «Моих заданиях»'],
      [500, 'Не получилось взять задание. Попробуйте ещё раз'],
      [404, 'Это задание уже удалено или скрыто и больше недоступно'],
    ]

    it.each(TEXTS)('статус %i: свой текст в role="alert", taken не отправляется', async (code, text) => {
      await mountButton({ take: () => Promise.reject(new ApiError(code)) })

      await click()

      expect(wrapper.find('[role="alert"] p').text()).toBe(text)
      expect(wrapper.emitted('taken')).toBeUndefined()
      expect(wrapper.emitted('login-required')).toBeUndefined()
      expect(wrapper.find('[role="status"]').text()).toBe('')
    })

    it('все шесть текстов различаются', () => {
      expect(new Set(TEXTS.map(([, text]) => text)).size).toBe(TEXTS.length)
    })

    it('лимит содержит число, которое проверяет сервер', async () => {
      await mountButton({ take: () => Promise.reject(new ApiError(409)) })

      await click()

      expect(MAX_QUIZZES_PER_TEACHER).toBeGreaterThan(0)
      expect(wrapper.find('[role="alert"] p').text()).toContain(String(MAX_QUIZZES_PER_TEACHER))
      expect(wrapper.find('[role="alert"]').text()).not.toContain('{max}')
    })

    it('лимит: ссылка в «Мои задания», кнопка снова доступна', async () => {
      await mountButton({ take: () => Promise.reject(new ApiError(409)) })
      await click()

      const link = wrapper.find('[role="alert"] a')
      expect(link.text()).toBe('Перейти в «Мои задания»')
      expect(link.attributes('href')).toBe('/teacher')
      expect(button().attributes('disabled')).toBeUndefined()
    })

    it('лимит на английском: ссылка с префиксом /en', async () => {
      await mountButton({ take: () => Promise.reject(new ApiError(409)) }, '/en/library/quiz/12')
      await click()

      const link = wrapper.find('[role="alert"] a')
      expect(link.text()).toBe('Go to My activities')
      expect(link.attributes('href')).toBe('/en/teacher')
      expect(wrapper.find('[role="alert"] p').text()).toContain(String(MAX_QUIZZES_PER_TEACHER))
    })

    it('notFound: ссылка «К разделам библиотеки», кнопка выключена', async () => {
      await mountButton({ take: () => Promise.reject(new ApiError(404)) })
      await click()

      const link = wrapper.find('[role="alert"] a')
      expect(link.text()).toBe('К разделам библиотеки')
      expect(link.attributes('href')).toBe('/library')
      expect(button().attributes('disabled')).toBeDefined()
    })

    it('notFound на английском: ссылка /en/library', async () => {
      await mountButton({ take: () => Promise.reject(new ApiError(404)) }, '/en/library/quiz/12')
      await click()

      expect(wrapper.find('[role="alert"] a').attributes('href')).toBe('/en/library')
    })

    it.each([503, 429, NETWORK_ERROR_STATUS, 500])('статус %i: без ссылок', async (code) => {
      await mountButton({ take: () => Promise.reject(new ApiError(code)) })
      await click()

      expect(wrapper.find('[role="alert"] a').exists()).toBe(false)
    })

    it('значок ошибки скрыт от экранного чтеца, сам текст без «⚠»', async () => {
      await mountButton({ take: () => Promise.reject(new ApiError(500)) })
      await click()

      expect(wrapper.find('.take-library-quiz-button__icon').attributes('aria-hidden')).toBe('true')
      expect(wrapper.find('.take-library-quiz-button__text--error').text()).not.toContain('⚠')
    })

    it.each([409, 503, 429, NETWORK_ERROR_STATUS, 500])('после ошибки %i фокус возвращается на кнопку', async (code) => {
      await mountButton({ take: () => Promise.reject(new ApiError(code)) })
      const focus = vi.spyOn(button().element as HTMLElement, 'focus')

      await click()
      await nextTick()

      expect(focus).toHaveBeenCalledTimes(1)
    })

    it('при ошибке «задание удалено» кнопка выключена и фокус на неё не возвращается', async () => {
      await mountButton({ take: () => Promise.reject(new ApiError(404)) })
      const focus = vi.spyOn(button().element as HTMLElement, 'focus')

      await click()
      await nextTick()

      expect(focus).not.toHaveBeenCalled()
    })

    it('после ошибки повторное нажатие работает и убирает сообщение', async () => {
      const take = vi
        .fn<() => Promise<TakenQuiz>>()
        .mockRejectedValueOnce(new ApiError(503))
        .mockResolvedValueOnce({ quizId: QUIZ_ID })
      wrapper = await mountSuspended(TakeLibraryQuizButton, { props: { isSignedIn: true, isReady: true, take } })

      await click()
      expect(wrapper.find('[role="alert"]').exists()).toBe(true)
      expect(button().attributes('disabled')).toBeUndefined()

      await click()

      expect(take).toHaveBeenCalledTimes(2)
      expect(wrapper.find('[role="alert"]').exists()).toBe(false)
      expect(wrapper.emitted('taken')).toEqual([[QUIZ_ID]])
    })
  })
})
