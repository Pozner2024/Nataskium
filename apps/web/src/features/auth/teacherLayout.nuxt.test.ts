import { mountSuspended } from '@nuxt/test-utils/runtime'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'
import { useRouter } from '#imports'
import { useAuthStore } from '@/features/auth'
import TeacherLayout from '../../../app/layouts/teacher.vue'

const SESSION = {
  accessToken: 'access-1',
  teacher: {
    id: '6f1c2a4e-8d3b-4f5a-9c7e-1b2d3e4f5a6b',
    email: 'qa-anna@example.test',
    displayName: 'Анна',
    hasPassword: true,
    hasGoogle: false,
  },
}

beforeEach(async () => {
  useAuthStore().$patch({ accessToken: null, teacher: null, status: 'unknown' })
  useAuthStore().setSession(SESSION)
  await useRouter().push('/teacher')
  await nextTick()
})

afterEach(() => {
  useAuthStore().$patch({ accessToken: null, teacher: null, status: 'unknown' })
})

describe('layout кабинета: конец сессии уводит на главную', () => {
  it('выход (сессия очищена) на странице кабинета — переход на главную', async () => {
    const wrapper = await mountSuspended(TeacherLayout, { route: '/teacher' })

    useAuthStore().clearSession()

    // Переход на главную идёт через роутер асинхронно: ждём, пока он завершится
    await vi.waitFor(() => expect(useRouter().currentRoute.value.fullPath).toBe('/'))
    wrapper.unmount()
  })

  it('пока сессия есть, кабинет остаётся открытым', async () => {
    const wrapper = await mountSuspended(TeacherLayout, { route: '/teacher' })

    await nextTick()

    expect(useRouter().currentRoute.value.fullPath).toBe('/teacher')
    wrapper.unmount()
  })
})
