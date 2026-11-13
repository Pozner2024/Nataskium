<template>
  <h1 class="teacher-create-page__title">{{ t('teacher.create.title') }}</h1>
  <ActivityTypePicker />
</template>

<script setup lang="ts">
import { useI18n, useSeoMeta } from '#imports'
import { ActivityTypePicker } from '@/widgets/activity-type-picker'

const { t } = useI18n()

useSeoMeta({ title: () => t('teacher.create.title'), robots: 'noindex, nofollow' })
</script>

<style scoped lang="scss">
@use '@/assets/styles/mixins' as *;

.teacher-create-page__title {
  @include section-title;
}
</style>
