<template>
  <QuizPlay v-if="view.kind === 'quiz'" :token="token" :initial="view.initial" />
  <MatchingPlay v-else-if="view.kind === 'matching'" :token="token" :initial="view.initial" />
  <section v-else class="play-page">
    <p class="play-page__message" role="status">{{ t('play.loading') }}</p>
  </section>
</template>

<script setup lang="ts">
import { shareTokenSchema } from '@nataskium/shared/schemas'
import { onMounted, ref } from 'vue'
import { useI18n, useSeoMeta } from '#imports'
import type { PlayMatchingResponse } from '@/entities/matching'
import { type PlayQuizResponse, playApi, usePlayLocaleRedirect } from '@/entities/quiz'
import { MatchingPlay } from '@/widgets/matching-play'
import { QuizPlay } from '@/widgets/quiz-play'

type PlayView =
  | { kind: 'loading' }
  | { kind: 'quiz'; initial?: PlayQuizResponse }
  | { kind: 'matching'; initial: PlayMatchingResponse }

const props = defineProps<{ token: string }>()

const { t } = useI18n()
const { redirect } = usePlayLocaleRedirect()
const view = ref<PlayView>({ kind: 'loading' })

useSeoMeta({ robots: 'noindex, nofollow' })

// Одна ссылка для задания любого типа: тип известен только из ответа GET.
// Невалидный токен и сбой запроса отдаются QuizPlay без initial: «не найдено» и «повторить» показывает он сам
async function loadView(token: string): Promise<PlayView> {
  if (!shareTokenSchema.safeParse(token).success) return { kind: 'quiz' }
  try {
    const response = await playApi.get(token)
    return response.type === 'quiz' ? { kind: 'quiz', initial: response } : { kind: 'matching', initial: response }
  } catch {
    return { kind: 'quiz' }
  }
}

// Язык выбирается до загрузки: после перехода на адрес другого языка страница загрузит задание заново
onMounted(async () => {
  if (await redirect()) return
  view.value = await loadView(props.token)
})
</script>

<style scoped lang="scss">
.play-page {
  display: flex;
  flex: 1;
  flex-direction: column;
  width: 100%;
  max-width: 560px;
  margin: 0 auto;
  padding: 8px var(--gutter) 24px;
}

.play-page__message {
  margin: 48px 0 0;
  color: var(--color-text-muted);
  font-size: 18px;
  font-weight: 500;
  line-height: 1.4;
  text-align: center;
}
</style>
