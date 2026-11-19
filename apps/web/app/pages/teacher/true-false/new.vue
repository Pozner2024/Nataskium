<template>
  <TrueFalseEditorPage />
</template>

<script setup lang="ts">
import TrueFalseEditorPage from '@/pages/TrueFalseEditorPage.vue'

definePageMeta({ name: 'teacher-true-false-new', layout: 'teacher', middleware: 'teacher-auth' })
</script>
