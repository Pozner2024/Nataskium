import { onMounted, ref } from 'vue'
import type { Activity } from '@/entities/activity'
import { quizApi } from '@/entities/quiz'
import { authorizedRequest } from '@/features/auth'
import type { ActivitiesStatus } from './types'

// Все задания пока — викторины; другие типы добавятся вместе со своими API
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
      activities.value = quizzes.map((quiz) => ({ ...quiz, type: 'quiz' }))
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
      await authorizedRequest((accessToken) => quizApi.remove(activity.id, accessToken))
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
