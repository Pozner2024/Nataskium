<template>
  <QuizEditorPage :quiz-id="String(route.params.id)" />
</template>

<script setup lang="ts">
import { useRoute } from '#imports'
import QuizEditorPage from '@/pages/QuizEditorPage.vue'

const route = useRoute()

definePageMeta({ name: 'teacher-quiz-edit', layout: 'teacher', middleware: 'teacher-auth' })
</script>
