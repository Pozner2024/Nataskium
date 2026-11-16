import { mountSuspended } from '@nuxt/test-utils/runtime'
import type { VueWrapper } from '@vue/test-utils'
import { afterEach, describe, expect, it } from 'vitest'
import { clearError, showError, useError } from '#imports'
import ErrorView from '../../app/error.vue'

// Тот же вызов, что делает LibraryQuizPage; здесь showError настоящий, а не подмена
const NOT_FOUND = { statusCode: 404, status: 404, statusMessage: 'Not Found' }
const NOT_FOUND_TITLE = 'Такой страницы нет'
const SERVER_ERROR_TITLE = 'Что-то пошло не так'

let wrapper: VueWrapper

afterEach(async () => {
  wrapper.unmount()
  await clearError()
})

describe('app/error.vue после showError из страницы задания библиотеки', () => {
  it('показывает «не найдено», а не текст про серверную ошибку', async () => {
    showError(NOT_FOUND)
    const error = useError().value!

    // Что именно кладёт Nuxt в ошибку: от этого зависит, какой текст выберет ErrorPage
    expect(error.status).toBe(404)
    expect(error.statusCode).toBe(404)

    wrapper = await mountSuspended(ErrorView, { props: { error } })

    expect(wrapper.find('.error-page__code').text()).toBe('404')
    expect(wrapper.find('h1').text()).toBe(NOT_FOUND_TITLE)
    expect(wrapper.find('h1').text()).not.toBe(SERVER_ERROR_TITLE)
    expect(wrapper.text()).toContain('ссылка устарела')
  })
})
