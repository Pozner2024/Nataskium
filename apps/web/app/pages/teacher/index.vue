<template>
  <TeacherActivitiesPage />
</template>

<script setup lang="ts">
import TeacherActivitiesPage from '@/pages/TeacherActivitiesPage.vue'

definePageMeta({ name: 'teacher', layout: 'teacher', middleware: 'teacher-auth' })
</script>
