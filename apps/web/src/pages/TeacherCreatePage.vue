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

const NEW_ACTIVITY_PATHS: Partial<Record<ActivityType, string>> = {
  quiz: TEACHER_PATHS.quizNew,
  matching: TEACHER_PATHS.matchingNew,
}

// Пропуски и картинки появятся вместе со своими редакторами
async function select(type: ActivityType) {
  const path = NEW_ACTIVITY_PATHS[type]
  if (!path) return
  await navigateTo(localePath(path))
}
</script>

<style scoped lang="scss">
@use '@/assets/styles/mixins' as *;

.teacher-create-page__title {
  @include section-title;
}
</style>
