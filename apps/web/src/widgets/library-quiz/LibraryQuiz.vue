<template>
  <div class="library-quiz">
    <p v-if="status === 'loading'" class="library-quiz__loading" role="status">{{ t('library.loading') }}</p>

    <div v-else-if="status === 'error'" class="library-quiz__error">
      <p role="alert">{{ t('library.loadError') }}</p>
      <button class="library-quiz__button" type="button" @click="load">{{ t('library.retry') }}</button>
    </div>

    <article v-else-if="quiz" class="library-quiz__card">
      <NuxtLink class="library-quiz__back" :to="localePath(libraryGroupPath(quiz.groupSlug))">
        {{ t('library.quiz.backToGroup') }}
      </NuxtLink>

      <h1 class="library-quiz__title">{{ quiz.title }}</h1>
      <p class="library-quiz__meta">{{ meta }}</p>
      <p class="library-quiz__grade" :class="{ 'library-quiz__grade--none': !quiz.graded }">
        {{ quiz.graded ? t('library.graded') : t('library.notGraded') }}
      </p>

      <section class="library-quiz__preview" aria-labelledby="library-quiz-preview-title">
        <h2 id="library-quiz-preview-title" class="library-quiz__preview-title">{{ t('library.quiz.previewTitle') }}</h2>

        <p v-if="quiz.questions.length === 0" class="library-quiz__note">{{ t('library.quiz.noQuestions') }}</p>
        <ol v-else class="library-quiz__questions">
          <li v-for="(question, position) in quiz.questions" :key="position" class="library-quiz__question">
            <LibraryQuizQuestion :number="position + 1" :question="question" />
          </li>
        </ol>

        <p v-if="quiz.questionCount > quiz.questions.length" class="library-quiz__note">
          {{ t('library.quiz.previewNote', { shown: quiz.questions.length, total: quiz.questionCount }) }}
        </p>
      </section>

      <div class="library-quiz__actions" />
    </article>
  </div>
</template>

<script setup lang="ts">
import { libraryGroupPath } from '@nataskium/shared/routes'
import { computed, onMounted, toRef, watch } from 'vue'
import { NuxtLink } from '#components'
import { useI18n, useLocalePath } from '#imports'
import { useLibraryGroups } from '@/entities/library'
import { useCurrentLocale } from '@/shared'
import { formatLibraryDate } from './formatLibraryDate'
import LibraryQuizQuestion from './LibraryQuizQuestion.vue'
import { useLibraryQuiz } from './useLibraryQuiz'

const props = defineProps<{ number: number }>()
const emit = defineEmits<{ 'not-found': []; loaded: [title: string] }>()

const { t } = useI18n()
const localePath = useLocalePath()
const locale = useCurrentLocale()
const { groups, load: loadGroups } = useLibraryGroups()
const { quiz, status, load } = useLibraryQuiz(toRef(props, 'number'))

const meta = computed(() => {
  if (!quiz.value) return ''
  const groupName = groups.value.find((item) => item.slug === quiz.value?.groupSlug)?.name
  const date = formatLibraryDate(quiz.value.createdAt, locale.value)
  return [
    groupName,
    t('library.questions', { count: quiz.value.questionCount }),
    date === '' ? undefined : t('library.quiz.addedOn', { date }),
  ]
    .filter((part) => part)
    .join(' · ')
})

watch(status, (value) => {
  if (value === 'notFound') emit('not-found')
  if (value === 'ready' && quiz.value) emit('loaded', quiz.value.title)
})

onMounted(() => {
  void loadGroups()
  void load()
})
</script>

<style scoped lang="scss">
.library-quiz__loading {
  margin: 24px 0 0;
  color: var(--color-text-muted);
  font-weight: 500;
  text-align: center;
}

.library-quiz__error {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  margin-top: 16px;
  text-align: center;

  p {
    margin: 0;
    font-weight: 500;
  }
}

.library-quiz__button {
  min-height: 48px;
  padding: 0 18px;
  border: 0;
  border-radius: 14px;
  background: rgb(var(--rgb-blue) / 0.1);
  color: var(--color-blue-dark);
  font: inherit;
  font-weight: 700;
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

.library-quiz__card {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.library-quiz__back {
  align-self: flex-start;
  display: flex;
  align-items: center;
  min-height: 44px;
  color: var(--color-blue-dark);
  font-weight: 600;
  text-decoration: none;
}

.library-quiz__title {
  margin: 0;
  font-family: var(--font-display);
  font-size: 22px;
  font-weight: 700;
  line-height: 1.25;
  overflow-wrap: anywhere;
}

.library-quiz__meta {
  margin: 0;
  color: var(--color-text-muted);
  font-size: 15px;
  line-height: 1.4;
}

.library-quiz__grade {
  align-self: flex-start;
  margin: 4px 0 0;
  padding: 2px 10px;
  border-radius: 999px;
  background: rgb(var(--rgb-green) / 0.16);
  font-size: 13px;
  font-weight: 500;
}

.library-quiz__grade--none {
  background: rgb(var(--rgb-blue) / 0.1);
  color: var(--color-text-muted);
}

.library-quiz__preview {
  display: flex;
  flex-direction: column;
  gap: 12px;
  margin-top: 16px;
}

.library-quiz__preview-title {
  margin: 0;
  font-size: 20px;
  font-weight: 700;
  line-height: 1.3;
}

.library-quiz__questions {
  display: flex;
  flex-direction: column;
  gap: 12px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.library-quiz__note {
  margin: 0;
  color: var(--color-text-muted);
  font-size: 15px;
  line-height: 1.4;
}

.library-quiz__actions {
  margin-top: 8px;
}

@media (prefers-reduced-motion: reduce) {
  .library-quiz__button {
    transition: none;
  }
}
</style>
