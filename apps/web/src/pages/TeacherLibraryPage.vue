<template>
  <h1 class="teacher-library-page__title">{{ t('teacher.library.title') }}</h1>
  <AppEmptyState :title="t('teacher.library.soonTitle')" :text="t('teacher.library.soonText')" />
</template>

<script setup lang="ts">
import { useI18n, useSeoMeta } from '#imports'
import { AppEmptyState } from '@/shared'

const { t } = useI18n()

useSeoMeta({ title: () => t('teacher.library.title'), robots: 'noindex, nofollow' })
</script>

<style scoped lang="scss">
@use '@/assets/styles/mixins' as *;

.teacher-library-page__title {
  @include section-title;
}
</style>
