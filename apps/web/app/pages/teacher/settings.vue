<template>
  <TeacherSettingsPage />
</template>

<script setup lang="ts">
import TeacherSettingsPage from '@/pages/TeacherSettingsPage.vue'

definePageMeta({ name: 'teacher-settings', layout: 'teacher', middleware: 'teacher-auth' })
</script>
