<template>
  <div class="teacher-preview">
    <section class="teacher-preview__item" data-case="activities-list">
      <h2 class="teacher-preview__name">activities-list</h2>
      <MyActivities :activities="ACTIVITIES_STUB" />
    </section>

    <section class="teacher-preview__item" data-case="activities-error">
      <h2 class="teacher-preview__name">activities-error</h2>
      <MyActivities :activities="[]" status="error" />
    </section>

    <section class="teacher-preview__item" data-case="quiz-editor">
      <h2 class="teacher-preview__name">quiz-editor: {{ quizCase }}</h2>
      <div class="teacher-preview__cases">
        <button v-for="name in QUIZ_CASES" :key="name" class="teacher-preview__case" type="button" @click="showQuizCase(name)">
          {{ name }}
        </button>
      </div>
      <QuizEditor />
    </section>

    <section class="teacher-preview__item" data-case="activities-empty">
      <h2 class="teacher-preview__name">activities-empty</h2>
      <MyActivities :activities="[]" />
    </section>

    <section v-for="item in PASSWORD_CASES" :key="item.name" class="teacher-preview__item teacher-preview__item--panel" :data-case="item.name">
      <h2 class="teacher-preview__name">{{ item.name }}</h2>
      <ChangePasswordForm v-bind="item.props" />
    </section>

    <section class="teacher-preview__item teacher-preview__item--panel" data-case="delete-google">
      <h2 class="teacher-preview__name">delete-google</h2>
      <DeleteAccount v-model:open="isGoogleDialogOpen" :has-password="false" />
    </section>

    <section class="teacher-preview__item teacher-preview__item--panel" data-case="delete-error">
      <h2 class="teacher-preview__name">delete-error</h2>
      <DeleteAccount error="Неверный пароль" />
    </section>
  </div>
</template>

<script setup lang="ts">
import { DEFAULT_INTRO_THEME_KEY, type IntroThemeKey } from '@nataskium/shared/schemas'
import { ref } from 'vue'
import { usePinia, useSeoMeta } from '#imports'
import type { Activity } from '@/entities/activity'
import { ChangePasswordForm } from '@/features/change-password'
import { DeleteAccount } from '@/features/delete-account'
import { MyActivities } from '@/widgets/my-activities'
import { QuizEditor } from '@/widgets/quiz-editor'

const ACTIVITIES_STUB: Activity[] = [
  {
    id: 'stub-1',
    title: 'Дроби: сложение и вычитание',
    type: 'quiz',
    questionCount: 12,
    gradingScale: 'five',
    shareToken: 'stub-token-1',
    introTheme: DEFAULT_INTRO_THEME_KEY,
    thumbnail: { type: 'quiz', text: 'Сколько будет 1/2 + 1/4?', imageUrl: null, options: [{ text: '3/4' }, { text: '2/6' }, { text: '1/8' }, { text: '1' }] },
  },
  {
    id: 'stub-2',
    title: 'Столицы Европы',
    type: 'matching',
    questionCount: 8,
    gradingScale: null,
    shareToken: 'stub-token-2',
    introTheme: DEFAULT_INTRO_THEME_KEY,
    thumbnail: { type: 'matching', definitions: ['Столица Франции', 'Столица Италии', 'Столица Испании'] },
  },
  {
    id: 'stub-3',
    title: 'Животные Африки',
    type: 'truefalse',
    questionCount: 10,
    gradingScale: 'letter',
    shareToken: 'stub-token-3',
    introTheme: DEFAULT_INTRO_THEME_KEY,
    thumbnail: { type: 'truefalse', statement: 'Жираф — самое высокое животное на Земле' },
  },
]

// Состояния редактора викторины задаются прямо в state Pinia: store виджета наружу не экспортируется
const QUIZ_CASES = ['new', 'filled', 'errors', 'settings', 'settings-error', 'settings-stopwatch', 'settings-limit'] as const
type QuizCase = (typeof QUIZ_CASES)[number]

interface QuizEditorPreviewState {
  quiz: {
    title: string
    showAnswers: boolean
    gradingScale: 'ten' | 'five' | 'letter' | null
    group: string
    introTheme: IntroThemeKey
    timer: { mode: 'none' | 'stopwatch' } | { mode: 'limit'; seconds: number }
    questions: { text: string; imageId: string | null; options: { text: string; isCorrect: boolean; imageId: string | null }[] }[]
  }
  shareToken: string | null
  expandedIndex: number | null
  view: 'questions' | 'settings'
  saveStatus: string
  fieldErrors: Record<string, string>
}

const PREVIEW_LIMIT_SECONDS = 900

const PREVIEW_QUESTIONS = [
  {
    text: 'Столица Франции?',
    imageId: null,
    options: [
      { text: 'Париж', isCorrect: true, imageId: null },
      { text: 'Лион', isCorrect: false, imageId: null },
      { text: 'Марсель', isCorrect: false, imageId: null },
      { text: 'Ницца', isCorrect: false, imageId: null },
    ],
  },
  {
    text: 'Какие города стоят на Дунае? Отметьте все подходящие варианты, даже если сомневаетесь',
    imageId: null,
    options: [
      { text: 'Вена', isCorrect: true, imageId: null },
      { text: 'Будапешт', isCorrect: true, imageId: null },
      { text: 'Прага', isCorrect: false, imageId: null },
      { text: 'Варшава', isCorrect: false, imageId: null },
    ],
  },
  {
    text: '',
    imageId: null,
    options: [
      { text: '', isCorrect: true, imageId: null },
      { text: '', isCorrect: false, imageId: null },
    ],
  },
]

const pinia = usePinia()
const quizCase = ref<QuizCase>('new')

function showQuizCase(name: QuizCase) {
  const state = pinia.state.value['quiz-editor'] as QuizEditorPreviewState | undefined
  if (!state) return
  quizCase.value = name
  const isNew = name === 'new'
  state.view = 'questions'
  state.shareToken = null
  state.saveStatus = 'idle'
  state.fieldErrors = {}
  state.expandedIndex = isNew ? 0 : 1
  state.quiz = isNew
    ? {
        title: '',
        showAnswers: true,
        gradingScale: null,
        group: '',
        introTheme: DEFAULT_INTRO_THEME_KEY,
        timer: { mode: 'none' },
        questions: [structuredClone(PREVIEW_QUESTIONS[2]!)],
      }
    : {
        title: 'Столицы Европы',
        showAnswers: true,
        gradingScale: 'ten',
        group: 'humanities',
        introTheme: DEFAULT_INTRO_THEME_KEY,
        timer: { mode: 'none' },
        questions: structuredClone(PREVIEW_QUESTIONS),
      }
  if (name === 'errors') {
    state.quiz.title = ''
    state.expandedIndex = 2
    state.saveStatus = 'invalid'
    state.fieldErrors = {
      title: 'Text is required',
      'questions.2.text': 'Text is required',
      'questions.2.options.0.text': 'Text is required',
    }
  }
  if (name.startsWith('settings')) {
    state.shareToken = 'k7Qm2xTz'
    state.view = 'settings'
    if (name === 'settings-stopwatch') state.quiz.timer = { mode: 'stopwatch' }
    if (name === 'settings-limit') state.quiz.timer = { mode: 'limit', seconds: PREVIEW_LIMIT_SECONDS }
    if (name === 'settings-error') state.saveStatus = 'failed'
  }
}

useSeoMeta({ robots: 'noindex, nofollow' })

const PASSWORD_CASES = [
  { name: 'password-loading', props: { isLoading: true } },
  {
    name: 'password-error',
    props: {
      formError: 'Не получилось сменить пароль. Попробуйте позже.',
      fieldErrors: { currentPassword: 'Неверный текущий пароль', newPassword: 'Пароль должен быть не короче 4 символов' },
    },
  },
  { name: 'password-done', props: { isDone: true } },
]

const isGoogleDialogOpen = ref(false)
</script>

<style scoped lang="scss">
@use '@/assets/styles/mixins' as *;

.teacher-preview {
  display: flex;
  flex-direction: column;
  gap: 40px;
}

.teacher-preview__item {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.teacher-preview__item--panel {
  padding: 20px;
  border-radius: 22px;
  @include card-surface;
}

.teacher-preview__cases {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.teacher-preview__case {
  min-height: 44px;
  padding: 0 12px;
  border: 1px solid rgb(var(--rgb-blue) / 0.3);
  border-radius: 12px;
  background: var(--color-white);
  color: var(--color-blue-dark);
  font: inherit;
  font-size: 14px;
  cursor: pointer;
}

.teacher-preview__name {
  margin: 0;
  font-family: var(--font-display);
  font-size: 14px;
  font-weight: 500;
}
</style>
