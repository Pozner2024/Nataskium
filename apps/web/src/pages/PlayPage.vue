<template>
  <div>
    <IntroPlayer
      :key="view.kind"
      :intro="intro !== null"
      skippable
      :intro-theme="intro ? introTheme : null"
      :type-label="intro?.typeLabel ?? ''"
      :title="intro?.title ?? ''"
      :hint="intro?.hint ?? ''"
      :start-label="t('play.intro.start')"
      :skip-label="t('play.intro.skip')"
      :enter-fullscreen-label="t('play.intro.fullscreen')"
      :exit-fullscreen-label="t('play.intro.exitFullscreen')"
      :collapse-label="t('play.intro.collapse')"
      :scroll-down-label="t('play.intro.scrollDown')"
      :unmute-label="t('play.intro.unmute')"
      :mute-label="t('play.intro.mute')"
      :rules="rules"
      :rules-note="t('play.rules.grading')"
      :rules-label="t('play.rules.open')"
      :rules-close-label="t('play.rules.close')"
    >
      <QuizPlay v-if="view.kind === 'quiz'" :token="token" :initial="view.initial" />
      <MatchingPlay v-else-if="view.kind === 'matching'" :token="token" :initial="view.initial" />
      <TrueFalsePlay v-else-if="view.kind === 'truefalse'" :token="token" :initial="view.initial" />
      <section v-else class="play-page">
        <p class="play-page__message" role="status">{{ t('play.loading') }}</p>
      </section>
    </IntroPlayer>
    <PlayPanel v-if="intro" v-model:intro-theme="introTheme" :title="intro.title" :token="token" />
  </div>
</template>

<script setup lang="ts">
import { DEFAULT_INTRO_THEME_KEY, shareTokenSchema, type IntroThemeKey } from '@nataskium/shared/schemas'
import { computed, onMounted, ref } from 'vue'
import { useI18n, useSeoMeta } from '#imports'
import type { PlayMatchingResponse } from '@/entities/matching'
import type { PlayTrueFalseResponse } from '@/entities/true-false'
import { type PlayQuizResponse, playApi, usePlayLocaleRedirect } from '@/entities/quiz'
import { IntroPlayer } from '@/widgets/intro-player'
import { PlayPanel } from '@/widgets/play-panel'
import { MatchingPlay } from '@/widgets/matching-play'
import { QuizPlay } from '@/widgets/quiz-play'
import { TrueFalsePlay } from '@/widgets/true-false-play'

type PlayView =
  | { kind: 'loading' }
  | { kind: 'quiz'; initial?: PlayQuizResponse }
  | { kind: 'matching'; initial: PlayMatchingResponse }
  | { kind: 'truefalse'; initial: PlayTrueFalseResponse }

const props = defineProps<{ token: string }>()

const { t } = useI18n()
const { redirect } = usePlayLocaleRedirect()
const view = ref<PlayView>({ kind: 'loading' })
// Стиль выбрал учитель; ученик может сменить его, но только пока открыта страница — выбор нигде не хранится
const introTheme = ref<IntroThemeKey>(DEFAULT_INTRO_THEME_KEY)

// Интро только у загруженного задания: у загрузки и ошибок нет названия, их показывает игра без интро
const intro = computed(() => {
  const current = view.value
  if (current.kind === 'quiz' && current.initial) {
    return { typeLabel: t('play.intro.quizType'), title: current.initial.quiz.title, hint: t('play.intro.quizHint') }
  }
  if (current.kind === 'matching') {
    return { typeLabel: t('play.intro.matchingType'), title: current.initial.matching.title, hint: t('play.intro.matchingHint') }
  }
  if (current.kind === 'truefalse') {
    return { typeLabel: t('play.intro.trueFalseType'), title: current.initial.trueFalse.title, hint: t('play.intro.trueFalseHint') }
  }
  return null
})

// Шаги «Как играть» для типа задания; у загрузки и ошибок правил нет
const RULES_KEYS = { quiz: 'quiz', matching: 'matching', truefalse: 'trueFalse' } as const
const rules = computed(() => {
  const kind = view.value.kind
  if (kind === 'loading' || intro.value === null) return []
  const key = RULES_KEYS[kind]
  return [t(`play.rules.${key}.step1`), t(`play.rules.${key}.step2`), t(`play.rules.${key}.step3`)]
})

useSeoMeta({ robots: 'noindex, nofollow' })

// Одна ссылка для задания любого типа: тип известен только из ответа GET.
// Невалидный токен и сбой запроса отдаются QuizPlay без initial: «не найдено» и «повторить» показывает он сам
async function loadView(token: string): Promise<PlayView> {
  if (!shareTokenSchema.safeParse(token).success) return { kind: 'quiz' }
  try {
    const response = await playApi.get(token)
    switch (response.type) {
      case 'quiz':
        return { kind: 'quiz', initial: response }
      case 'matching':
        return { kind: 'matching', initial: response }
      case 'truefalse':
        return { kind: 'truefalse', initial: response }
    }
  } catch {
    return { kind: 'quiz' }
  }
}

// Язык выбирается до загрузки: после перехода на адрес другого языка страница загрузит задание заново
onMounted(async () => {
  if (await redirect()) return
  view.value = await loadView(props.token)
  introTheme.value = teacherTheme(view.value)
})

function teacherTheme(current: PlayView): IntroThemeKey {
  if (current.kind === 'quiz') return current.initial?.quiz.introTheme ?? DEFAULT_INTRO_THEME_KEY
  if (current.kind === 'matching') return current.initial.matching.introTheme
  if (current.kind === 'truefalse') return current.initial.trueFalse.introTheme
  return DEFAULT_INTRO_THEME_KEY
}
</script>

<style scoped lang="scss">
.play-page {
  display: flex;
  flex-direction: column;
  padding: 8px var(--gutter) 24px;
}

.play-page__message {
  margin: 48px 0 0;
  color: var(--g-muted);
  font-size: 18px;
  font-weight: 500;
  line-height: 1.4;
  text-align: center;
}
</style>
