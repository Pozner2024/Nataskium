<template>
  <div class="quiz-editor">
    <p v-if="store.loadStatus === 'loading'" class="quiz-editor__loading" role="status">{{ t('teacher.quizEditor.loading') }}</p>

    <div v-else-if="store.loadStatus === 'notFound'" class="quiz-editor__not-found">
      <p role="alert">{{ t('teacher.quizEditor.notFound') }}</p>
      <NuxtLink class="quiz-editor__back-link" :to="localePath(TEACHER_PATHS.activities)">
        {{ t('teacher.quizEditor.toActivities') }}
      </NuxtLink>
    </div>

    <div v-else-if="store.loadStatus === 'error'" class="quiz-editor__error">
      <p role="alert">{{ t('teacher.quizEditor.loadError') }}</p>
      <button class="quiz-editor__retry" type="button" @click="start">{{ t('teacher.activities.retry') }}</button>
    </div>

    <template v-else-if="store.view === 'settings'">
      <button class="quiz-editor__back" type="button" @click="store.view = 'questions'">
        {{ t('teacher.quizEditor.backToQuestions') }}
      </button>
      <QuizSettings />
    </template>

    <form v-else class="quiz-editor__form" novalidate @submit.prevent="save()">
      <label class="quiz-editor__label" for="quiz-title">{{ t('teacher.quizEditor.titleLabel') }}</label>
      <input
        id="quiz-title"
        v-model="store.quiz.title"
        class="quiz-editor__title-input"
        type="text"
        :maxlength="QUIZ_TITLE_MAX_LENGTH"
        :placeholder="t('teacher.quizEditor.titlePlaceholder')"
        :aria-invalid="titleError !== undefined"
        :aria-describedby="titleError ? 'quiz-title-error' : undefined"
      >
      <p v-if="titleError" id="quiz-title-error" class="quiz-editor__field-error" role="alert">{{ titleError }}</p>

      <ol class="quiz-editor__questions">
        <QuestionCard
          v-for="(_, index) in store.quiz.questions"
          :key="index"
          :index="index"
          :expanded="store.expandedIndex === index"
        />
      </ol>
      <p v-if="questionsError" class="quiz-editor__field-error" role="alert">{{ questionsError }}</p>

      <button
        class="quiz-editor__add"
        type="button"
        :disabled="store.quiz.questions.length >= MAX_QUESTIONS"
        @click="store.addQuestion()"
      >
        {{ t('teacher.quizEditor.addQuestion') }}
      </button>

      <p class="quiz-editor__status" role="status">{{ statusMessage }}</p>
      <p v-if="errorMessage" class="quiz-editor__error-text" role="alert">{{ errorMessage }}</p>

      <div class="quiz-editor__actions">
        <button class="quiz-editor__save" type="submit" :disabled="store.saveStatus === 'saving'">
          {{ t('teacher.quizEditor.save') }}
        </button>
        <button class="quiz-editor__settings" type="button" :disabled="store.saveStatus === 'saving'" @click="openSettings">
          {{ t('teacher.quizEditor.settingsButton') }}
        </button>
      </div>
    </form>
  </div>
</template>

<script setup lang="ts">
import { MAX_QUESTIONS, MAX_QUIZZES_PER_TEACHER, QUIZ_TITLE_MAX_LENGTH } from '@nataskium/shared/schemas'
import { computed, onBeforeUnmount, onMounted } from 'vue'
import { NuxtLink } from '#components'
import { navigateTo, onBeforeRouteLeave, useI18n, useLocalePath } from '#imports'
import { TEACHER_PATHS } from '@/shared'
import QuestionCard from './components/QuestionCard.vue'
import QuizSettings from './components/QuizSettings.vue'
import { issueText } from './quizErrors'
import { useQuizEditorStore } from './store'

const props = defineProps<{
  // Нет id — новая викторина
  quizId?: string
}>()

const { t } = useI18n()
const localePath = useLocalePath()
const store = useQuizEditorStore()

const titleError = computed(() => fieldError('title'))
const questionsError = computed(() => fieldError('questions'))
const statusMessage = computed(() => (store.saveStatus === 'saved' ? t('teacher.quizEditor.saved') : ''))
const errorMessage = computed(() => {
  if (store.saveStatus === 'tooLarge') return t('teacher.quizEditor.tooLarge')
  if (store.saveStatus === 'limitReached') return t('teacher.quizEditor.limitReached', { max: MAX_QUIZZES_PER_TEACHER })
  if (store.saveStatus === 'imageUnavailable') return t('teacher.quizEditor.imageUnavailable')
  if (store.saveStatus === 'failed') return t('teacher.quizEditor.saveFailed')
  if (store.saveStatus === 'invalid') return t('teacher.quizEditor.invalid')
  return ''
})

function fieldError(key: string): string | undefined {
  const message = store.fieldErrors[key]
  return message === undefined ? undefined : issueText(key, message, t)
}

// После создания страница меняется на /teacher/quiz/<id>, и store уже хранит эту викторину: заново её не грузим
// Старая страница размонтируется, когда новая уже могла стартовать: решение о сбросе держим здесь
let isHandingOver = false

async function start(): Promise<void> {
  if (props.quizId === undefined) {
    if (store.id !== null) store.reset()
    return
  }
  if (store.handoverId === props.quizId) {
    store.handoverId = null
    return
  }
  store.reset()
  await store.load(props.quizId)
}

// beforeNavigate — действие до перехода на адрес созданной викторины: после него старая страница уже не живёт
async function save(beforeNavigate?: () => void): Promise<boolean> {
  const isNew = store.id === null
  const isSaved = await store.save()
  if (isSaved) beforeNavigate?.()
  if (isSaved && isNew && store.id !== null) {
    isHandingOver = true
    store.handoverId = store.id
    try {
      await navigateTo(localePath(`${TEACHER_PATHS.quizEdit}/${store.id}`), { replace: true })
    } finally {
      // Новая страница к этому времени уже забрала передачу; не удалась навигация — передачи не было
      store.handoverId = null
      isHandingOver = false
    }
  }
  return isSaved
}

async function openSettings(): Promise<void> {
  await save(() => {
    store.view = 'settings'
  })
}

function warnBeforeUnload(event: BeforeUnloadEvent): void {
  if (store.isDirty) event.preventDefault()
}

onBeforeRouteLeave(() => {
  if (!store.isDirty) return true
  return window.confirm(t('teacher.quizEditor.leaveConfirm'))
})

onMounted(() => {
  window.addEventListener('beforeunload', warnBeforeUnload)
  void start()
})
onBeforeUnmount(() => {
  window.removeEventListener('beforeunload', warnBeforeUnload)
  // Состояние не переносится между заходами; исключение — переход после создания
  if (!isHandingOver) store.reset()
})
</script>

<style scoped lang="scss">
@use '@/assets/styles/mixins' as *;

%message {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  margin: 0;
  font-size: 15px;
  font-weight: 500;
  line-height: 1.4;

  &::before {
    display: grid;
    flex: none;
    place-items: center;
    width: 20px;
    height: 20px;
    margin-top: 1px;
    border-radius: 50%;
    color: var(--color-white);
    font-size: 13px;
    font-weight: 700;
    line-height: 1;
  }
}

// Текст ошибки тёмный, знак оранжевый: оранжево-тёмный текст на белом дал бы 3.6:1
%error {
  @extend %message;

  &::before {
    content: '!';
    content: '!' / '';
    background: var(--color-orange-dark);
  }
}

%soft-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 44px;
  padding: 0 16px;
  border: 0;
  border-radius: 14px;
  background: rgb(var(--rgb-blue) / 0.1);
  color: var(--color-blue-dark);
  font: inherit;
  font-weight: 700;
  line-height: 1.2;
  text-decoration: none;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
  transition: background-color 0.2s ease;

  @media (hover: hover) {
    &:hover {
      background: rgb(var(--rgb-blue) / 0.16);
    }
  }

  &:active {
    background: rgb(var(--rgb-blue) / 0.24);
  }
}

%pill-button {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  min-height: 52px;
  padding: 8px 16px;
  border: 0;
  border-radius: 999px;
  font: inherit;
  font-weight: 700;
  line-height: 1.25;
  text-align: center;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
  transition:
    background-color 0.2s ease,
    box-shadow 0.2s ease,
    transform 0.2s ease;

  &:active:not(:disabled) {
    transform: scale(0.98);
  }

  &:disabled {
    cursor: progress;
    opacity: 0.7;
  }
}

.quiz-editor {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.quiz-editor__loading {
  margin: 0;
  color: var(--color-text-muted);
}

.quiz-editor__not-found,
.quiz-editor__error {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 12px;
  padding: 20px;
  border-radius: 22px;
  @include card-surface;

  p {
    margin: 0;
    font-weight: 500;
  }
}

.quiz-editor__back-link,
.quiz-editor__retry {
  @extend %soft-button;
}

.quiz-editor__back {
  @extend %soft-button;

  align-self: flex-start;
  margin-left: -4px;
  background: none;
}

.quiz-editor__form {
  display: flex;
  flex-direction: column;
}

.quiz-editor__label {
  font-size: 15px;
  font-weight: 500;
  line-height: 1.3;
}

.quiz-editor__title-input {
  width: 100%;
  min-height: 56px;
  margin-top: 8px;
  padding: 12px 16px;
  border: 2px solid var(--color-text-muted);
  border-radius: 16px;
  background: var(--color-white);
  color: var(--color-text);
  font: inherit;
  font-size: 18px;
  font-weight: 700;
  line-height: 1.25;
  transition: border-color 0.2s ease;

  &::placeholder {
    color: var(--color-text-muted);
    font-weight: 400;
  }

  &:focus {
    border-color: var(--color-blue-dark);
  }

  &[aria-invalid='true'] {
    border-color: var(--color-orange-dark);
  }
}

.quiz-editor__field-error {
  @extend %error;

  margin-top: 8px;
}

.quiz-editor__questions {
  display: flex;
  flex-direction: column;
  gap: 12px;
  margin: 20px 0 0;
  padding: 0;
}

.quiz-editor__add {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 56px;
  margin-top: 12px;
  padding: 8px 16px;
  border: 2px dashed rgb(var(--rgb-blue) / 0.6);
  border-radius: 22px;
  background: var(--color-white);
  color: var(--color-blue-dark);
  font: inherit;
  font-weight: 700;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
  transition: background-color 0.2s ease;

  @media (hover: hover) {
    &:hover:not(:disabled) {
      background: rgb(var(--rgb-blue) / 0.06);
    }
  }

  &:active:not(:disabled) {
    background: rgb(var(--rgb-blue) / 0.14);
  }

  &:disabled {
    cursor: not-allowed;
    opacity: 0.45;
  }
}

// Пустая строка статуса остаётся в разметке (её читает скринридер), но места не занимает
.quiz-editor__status:not(:empty) {
  @extend %message;

  align-self: flex-start;
  margin-top: 16px;
  padding: 6px 12px 6px 8px;
  border-radius: 999px;
  background: rgb(var(--rgb-green) / 0.14);

  &::before {
    content: '✓';
    content: '✓' / '';
    background: var(--color-green-dark);
  }
}

.quiz-editor__status:empty {
  margin: 0;
}

.quiz-editor__error-text {
  @extend %error;

  margin-top: 16px;
  padding: 12px 14px;
  border-radius: 16px;
  background: rgb(var(--rgb-orange) / 0.14);
}

.quiz-editor__actions {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin-top: 20px;
}

.quiz-editor__settings {
  @extend %pill-button;

  background: var(--color-blue-dark);
  box-shadow: 0 10px 24px rgb(var(--rgb-blue) / 0.35);
  color: var(--color-white);

  @media (hover: hover) {
    &:hover:not(:disabled) {
      box-shadow: 0 14px 28px rgb(var(--rgb-blue) / 0.45);
    }
  }
}

.quiz-editor__save {
  @extend %pill-button;

  background: rgb(var(--rgb-blue) / 0.1);
  color: var(--color-blue-dark);

  @media (hover: hover) {
    &:hover:not(:disabled) {
      background: rgb(var(--rgb-blue) / 0.16);
    }
  }

  &:active:not(:disabled) {
    background: rgb(var(--rgb-blue) / 0.24);
  }
}

@media (prefers-reduced-motion: reduce) {
  .quiz-editor__back-link,
  .quiz-editor__retry,
  .quiz-editor__back,
  .quiz-editor__title-input,
  .quiz-editor__add,
  .quiz-editor__settings,
  .quiz-editor__save {
    transition: none;
  }

  .quiz-editor__settings:active,
  .quiz-editor__save:active {
    transform: none;
  }
}
</style>
