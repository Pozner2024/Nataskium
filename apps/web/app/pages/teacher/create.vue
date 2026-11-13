<template>
  <TeacherCreatePage />
</template>

<script setup lang="ts">
import TeacherCreatePage from '@/pages/TeacherCreatePage.vue'

definePageMeta({ name: 'teacher-create', layout: 'teacher', middleware: 'teacher-auth' })
</script>
