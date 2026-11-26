<template>
  <h1 class="teacher-create-page__title">{{ t('teacher.create.title') }}</h1>
  <ActivityTypePicker @select="select" />
</template>

<script setup lang="ts">
import { navigateTo, useI18n, useLocalePath, useSeoMeta } from '#imports'
import type { ActivityType } from '@/entities/activity'
import { newActivityPath } from '@nataskium/shared/routes'
import { ActivityTypePicker } from '@/widgets/activity-type-picker'

const { t } = useI18n()
const localePath = useLocalePath()

useSeoMeta({ title: () => t('teacher.create.title'), robots: 'noindex, nofollow' })

async function select(type: ActivityType) {
  await navigateTo(localePath(newActivityPath(type)))
}
</script>

<style scoped lang="scss">
@use '@/assets/styles/mixins' as *;

.teacher-create-page__title {
  @include section-title;
}
</style>
