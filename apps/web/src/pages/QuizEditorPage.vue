<template>
  <h1 class="quiz-editor-page__title">{{ heading }}</h1>
  <QuizEditor :quiz-id="quizId" />
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useI18n, useSeoMeta } from '#imports'
import { QuizEditor } from '@/widgets/quiz-editor'

const props = defineProps<{
  quizId?: string
}>()

const { t } = useI18n()

const heading = computed(() => t(props.quizId === undefined ? 'teacher.quizEditor.headingNew' : 'teacher.quizEditor.headingEdit'))

useSeoMeta({ title: () => heading.value, robots: 'noindex, nofollow' })
</script>

<style scoped lang="scss">
@use '@/assets/styles/mixins' as *;

.quiz-editor-page__title {
  @include section-title;
}
</style>
