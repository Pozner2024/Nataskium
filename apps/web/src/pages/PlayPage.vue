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
      :scroll-down-label="t('play.intro.scrollDown')"
      :unmute-label="t('play.intro.unmute')"
      :mute-label="t('play.intro.mute')"
      :rules="rules"
      :rules-note="t('play.rules.grading')"
      :rules-label="t('play.rules.open')"
      :rules-close-label="t('play.rules.close')"
    >
      <QuizPlay v-if="view.kind === 'quiz'" :source="source" :initial="view.initial" />
      <MatchingPlay v-else-if="view.kind === 'matching' && source" :source="source" :initial="view.initial" />
      <TrueFalsePlay v-else-if="view.kind === 'truefalse' && source" :source="source" :initial="view.initial" />
      <section v-else-if="view.kind === 'notFound'" class="play-page">
        <div class="play-page__status">
          <p class="play-page__alert" role="alert">{{ t('play.notFound') }}</p>
        </div>
      </section>
      <section v-else-if="view.kind === 'failed'" class="play-page">
        <div class="play-page__status">
          <p class="play-page__alert" role="alert">{{ t('play.failed') }}</p>
          <button class="play-page__button" type="button" @click="reload">{{ t('play.retry') }}</button>
        </div>
      </section>
      <section v-else class="play-page">
        <p class="play-page__message" role="status">{{ t('play.loading') }}</p>
      </section>
    </IntroPlayer>
    <PlayPanel v-if="intro && source" v-model:intro-theme="introTheme" :title="intro.title" :source="source" />
  </div>
</template>

<script setup lang="ts">
import { parseQuizSlug, slugifyTitle } from '@nataskium/shared/library'
import { libraryQuizPath } from '@nataskium/shared/routes'
import { DEFAULT_INTRO_THEME_KEY, type IntroThemeKey } from '@nataskium/shared/schemas'
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { navigateTo, useI18n, useLocalePath, useRoute, useSeoMeta } from '#imports'
import type { PlayMatchingResponse } from '@/entities/matching'
import type { PlayTrueFalseResponse } from '@/entities/true-false'
import { type PlayQuizResponse, playApi, usePlayLocaleRedirect } from '@/entities/quiz'
import { ApiError, isPlaySourceValid, type PlaySource } from '@/shared'
import { IntroPlayer } from '@/widgets/intro-player'
import { PlayPanel } from '@/widgets/play-panel'
import { MatchingPlay } from '@/widgets/matching-play'
import { QuizPlay } from '@/widgets/quiz-play'
import { TrueFalsePlay } from '@/widgets/true-false-play'

const NOT_FOUND_STATUS = 404

type PlayView =
  | { kind: 'loading' }
  | { kind: 'notFound' }
  | { kind: 'failed' }
  | { kind: 'quiz'; initial: PlayQuizResponse }
  | { kind: 'matching'; initial: PlayMatchingResponse }
  | { kind: 'truefalse'; initial: PlayTrueFalseResponse }

// Адрес страницы: ссылка учителя /play/<token> или задание библиотеки /library/quiz/<номер>-<slug>
type PlayAddress = { kind: 'share'; token: string } | { kind: 'library'; slug: string }

const props = defineProps<{ address: PlayAddress }>()

const { t } = useI18n()
const { redirect } = usePlayLocaleRedirect()
const route = useRoute()
const localePath = useLocalePath()

function toSource(address: PlayAddress): PlaySource | null {
  if (address.kind === 'share') return { kind: 'share', token: address.token }
  const parsed = parseQuizSlug(address.slug)
  return parsed === null ? null : { kind: 'library', number: parsed.number }
}

// Источник берётся один раз: после исправления slug (replace) номер тот же, страница не пересоздаётся и не перезагружает игру
const source = toSource(props.address)
const view = ref<PlayView>({ kind: 'loading' })
// Стиль выбрал учитель; ученик может сменить его, но только пока открыта страница — выбор нигде не хранится
const introTheme = ref<IntroThemeKey>(DEFAULT_INTRO_THEME_KEY)

// Интро только у загруженного задания: у загрузки и ошибок нет названия, они показываются без интро
const intro = computed(() => {
  const current = view.value
  if (current.kind === 'quiz') {
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
  if (kind !== 'quiz' && kind !== 'matching' && kind !== 'truefalse') return []
  const key = RULES_KEYS[kind]
  return [t(`play.rules.${key}.step1`), t(`play.rules.${key}.step2`), t(`play.rules.${key}.step3`)]
})

useSeoMeta({ robots: 'noindex, nofollow' })

let unmounted = false
let isLoading = false

onBeforeUnmount(() => {
  unmounted = true
})

// Один адрес для задания любого типа: тип известен только из ответа GET.
// Ошибки первой загрузки обрабатываются здесь, чтобы повтор снова прошёл через диспетчер всех типов
async function loadView(from: PlaySource | null): Promise<PlayView> {
  if (!isPlaySourceValid(from)) return { kind: 'notFound' }
  try {
    const response = await playApi.get(from)
    switch (response.type) {
      case 'quiz':
        return { kind: 'quiz', initial: response }
      case 'matching':
        return { kind: 'matching', initial: response }
      case 'truefalse':
        return { kind: 'truefalse', initial: response }
    }
  } catch (error) {
    if (error instanceof ApiError && error.status === NOT_FOUND_STATUS) return { kind: 'notFound' }
    return { kind: 'failed' }
  }
}

async function reload(): Promise<void> {
  if (isLoading || unmounted) return
  isLoading = true
  view.value = { kind: 'loading' }
  try {
    const loaded = await loadView(source)
    if (unmounted) return
    view.value = loaded
    introTheme.value = teacherTheme(loaded)
    if (source?.kind === 'library' && intro.value) await fixLibrarySlug(source.number, intro.value.title)
  } finally {
    isLoading = false
  }
}

// Ссылка учителя: язык выбирается по браузеру до загрузки, после перехода на адрес другого языка страница загрузит
// задание заново. В библиотеке язык уже выбрал сам пользователь сайта — его не перебиваем
onMounted(async () => {
  if (props.address.kind === 'share' && (await redirect())) return
  if (unmounted) return
  await reload()
})

// Устаревший или неполный slug заменяется адресом из текущего названия; ключ страницы — номер, поэтому игра не перезапускается.
// params.slug уже раскодирован роутером: сравнение с кириллическим slug без лишнего перехода
async function fixLibrarySlug(number: number, title: string): Promise<void> {
  if (unmounted) return
  if (String(route.params.slug) === `${number}-${slugifyTitle(title)}`) return
  await navigateTo({ path: localePath(libraryQuizPath(number, title)), query: route.query, hash: route.hash }, { replace: true })
}

function teacherTheme(current: PlayView): IntroThemeKey {
  if (current.kind === 'quiz') return current.initial.quiz.introTheme
  if (current.kind === 'matching') return current.initial.matching.introTheme
  if (current.kind === 'truefalse') return current.initial.trueFalse.introTheme
  return DEFAULT_INTRO_THEME_KEY
}
</script>

<style scoped lang="scss">
@use '@/assets/styles/mixins' as *;

.play-page {
  display: flex;
  flex-direction: column;
  padding: 8px var(--gutter) 24px;
  color: var(--g-text);
}

.play-page__message {
  margin: 48px 0 0;
  color: var(--g-muted);
  font-size: 18px;
  font-weight: 500;
  line-height: 1.4;
  text-align: center;
}

.play-page__status {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 20px;
  margin-top: 32px;
  padding: 28px 20px 24px;
  text-align: center;
}

.play-page__alert {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 14px;
  margin: 0;
  font-size: 18px;
  font-weight: 600;
  line-height: 1.4;
  overflow-wrap: anywhere;

  &::before {
    content: '!';
    content: '!' / '';
    display: grid;
    place-items: center;
    width: 44px;
    height: 44px;
    border-radius: 50%;
    background: var(--color-orange-dark);
    color: var(--color-white);
    font-family: var(--font-display);
    font-size: 22px;
    font-weight: 700;
    line-height: 1;
  }
}

.play-page__button {
  @include play-secondary;
}
</style>
