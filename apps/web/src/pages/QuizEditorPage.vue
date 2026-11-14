<template>
  <h1 class="quiz-editor-page__title">{{ t('teacher.quizEditor.heading') }}</h1>
  <QuizEditor :quiz-id="quizId" />
</template>

<script setup lang="ts">
import { useI18n, useSeoMeta } from '#imports'
import { QuizEditor } from '@/widgets/quiz-editor'

defineProps<{
  quizId?: string
}>()

const { t } = useI18n()

useSeoMeta({ title: () => t('teacher.quizEditor.heading'), robots: 'noindex, nofollow' })
</script>

<style scoped lang="scss">
@use '@/assets/styles/mixins' as *;

.quiz-editor-page__title {
  @include section-title;
}
</style>
