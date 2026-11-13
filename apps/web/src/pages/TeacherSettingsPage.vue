<template>
  <h1 class="teacher-settings-page__title">{{ t('teacher.settings.title') }}</h1>
  <TeacherSettings />
</template>

<script setup lang="ts">
import { useI18n, useSeoMeta } from '#imports'
import { TeacherSettings } from '@/widgets/teacher-settings'

const { t } = useI18n()

useSeoMeta({ title: () => t('teacher.settings.title'), robots: 'noindex, nofollow' })
</script>

<style scoped lang="scss">
@use '@/assets/styles/mixins' as *;

.teacher-settings-page__title {
  @include section-title;
}
</style>
