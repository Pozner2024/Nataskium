<template>
  <TeacherLibraryPage />
</template>

<script setup lang="ts">
import TeacherLibraryPage from '@/pages/TeacherLibraryPage.vue'

definePageMeta({ name: 'teacher-library', layout: 'teacher', middleware: 'teacher-auth' })
</script>
