<template>
  <QuizEditorPage />
</template>

<script setup lang="ts">
import QuizEditorPage from '@/pages/QuizEditorPage.vue'

definePageMeta({ name: 'teacher-quiz-new', layout: 'teacher', middleware: 'teacher-auth' })
</script>
