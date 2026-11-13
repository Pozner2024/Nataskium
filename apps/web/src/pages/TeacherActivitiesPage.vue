<template>
  <h1 class="teacher-activities-page__title">{{ t('teacher.activities.title') }}</h1>
  <MyActivities :activities="ACTIVITIES_STUB" />
</template>

<script setup lang="ts">
import { useI18n, useSeoMeta } from '#imports'
import { ACTIVITIES_STUB, MyActivities } from '@/widgets/my-activities'

const { t } = useI18n()

useSeoMeta({ title: () => t('teacher.activities.title'), robots: 'noindex, nofollow' })
</script>

<style scoped lang="scss">
@use '@/assets/styles/mixins' as *;

.teacher-activities-page__title {
  @include section-title;
}
</style>
