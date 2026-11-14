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
import { ref } from 'vue'
import { usePinia, useSeoMeta } from '#imports'
import { ChangePasswordForm } from '@/features/change-password'
import { DeleteAccount } from '@/features/delete-account'
import { ACTIVITIES_STUB, MyActivities } from '@/widgets/my-activities'
import { QuizEditor } from '@/widgets/quiz-editor'

// Состояния редактора викторины задаются прямо в state Pinia: store виджета наружу не экспортируется
const QUIZ_CASES = ['new', 'filled', 'errors', 'settings', 'settings-error'] as const
type QuizCase = (typeof QUIZ_CASES)[number]

interface QuizEditorPreviewState {
  quiz: {
    title: string
    showAnswers: boolean
    gradingScale: 'ten' | 'five' | 'letter' | null
    questions: { text: string; options: { text: string; isCorrect: boolean }[] }[]
  }
  shareToken: string | null
  expandedIndex: number | null
  view: 'questions' | 'settings'
  saveStatus: string
  fieldErrors: Record<string, string>
}

const PREVIEW_QUESTIONS = [
  {
    text: 'Столица Франции?',
    options: [
      { text: 'Париж', isCorrect: true },
      { text: 'Лион', isCorrect: false },
      { text: 'Марсель', isCorrect: false },
      { text: 'Ницца', isCorrect: false },
    ],
  },
  {
    text: 'Какие города стоят на Дунае? Отметьте все подходящие варианты, даже если сомневаетесь',
    options: [
      { text: 'Вена', isCorrect: true },
      { text: 'Будапешт', isCorrect: true },
      { text: 'Прага', isCorrect: false },
      { text: 'Варшава', isCorrect: false },
    ],
  },
  { text: '', options: [{ text: '', isCorrect: true }, { text: '', isCorrect: false }] },
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
    ? { title: '', showAnswers: true, gradingScale: null, questions: [structuredClone(PREVIEW_QUESTIONS[2]!)] }
    : { title: 'Столицы Европы', showAnswers: true, gradingScale: 'ten', questions: structuredClone(PREVIEW_QUESTIONS) }
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
  if (name === 'settings' || name === 'settings-error') {
    state.shareToken = 'k7Qm2xTz'
    state.view = 'settings'
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
