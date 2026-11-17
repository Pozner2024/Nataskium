<template>
  <MatchingEditorPage />
</template>

<script setup lang="ts">
import MatchingEditorPage from '@/pages/MatchingEditorPage.vue'

definePageMeta({ name: 'teacher-matching-new', layout: 'teacher', middleware: 'teacher-auth' })
</script>
