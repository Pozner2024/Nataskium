<template>
  <h1 class="teacher-create-page__title">{{ t('teacher.create.title') }}</h1>
  <ActivityTypePicker @select="select" />
</template>

<script setup lang="ts">
import { navigateTo, useI18n, useLocalePath, useSeoMeta } from '#imports'
import type { ActivityType } from '@/entities/activity'
import { TEACHER_PATHS } from '@/shared'
import { ActivityTypePicker } from '@/widgets/activity-type-picker'

const { t } = useI18n()
const localePath = useLocalePath()

useSeoMeta({ title: () => t('teacher.create.title'), robots: 'noindex, nofollow' })

// Пока есть только викторина: остальные типы появятся вместе со своими редакторами
async function select(type: ActivityType) {
  if (type !== 'quiz') return
  await navigateTo(localePath(TEACHER_PATHS.quizNew))
}
</script>

<style scoped lang="scss">
@use '@/assets/styles/mixins' as *;

.teacher-create-page__title {
  @include section-title;
}
</style>
