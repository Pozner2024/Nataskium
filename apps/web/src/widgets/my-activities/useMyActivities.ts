import { onMounted, ref } from 'vue'
import type { Activity } from '@/entities/activity'
import { matchingApi } from '@/entities/matching'
import { quizApi } from '@/entities/quiz'
import { authorizedRequest } from '@/features/auth'
import type { ActivitiesStatus } from './types'

// Список общий для всех типов (GET /api/quizzes), удаление — через API своего типа
export function useMyActivities() {
  const activities = ref<Activity[]>([])
  const status = ref<ActivitiesStatus>('loading')
  const isRemoveFailed = ref(false)
  const isRemoving = ref(false)

  async function load(): Promise<void> {
    isRemoveFailed.value = false
    status.value = 'loading'
    try {
      const { quizzes } = await authorizedRequest((accessToken) => quizApi.list(accessToken))
      activities.value = quizzes
      status.value = 'ready'
    } catch {
      status.value = 'error'
    }
  }

  async function remove(activity: Activity): Promise<void> {
    // Параллельное удаление игнорируется: повторное подтверждение не должно слать второй запрос
    if (isRemoving.value) return
    isRemoving.value = true
    isRemoveFailed.value = false
    try {
      const api = activity.type === 'matching' ? matchingApi : quizApi
      await authorizedRequest((accessToken) => api.remove(activity.id, accessToken))
      activities.value = activities.value.filter((item) => item.id !== activity.id)
    } catch {
      isRemoveFailed.value = true
    } finally {
      isRemoving.value = false
    }
  }

  // Токен есть только в браузере: на сервере страница остаётся в состоянии загрузки
  onMounted(load)

  return { activities, status, isRemoveFailed, load, remove }
}
