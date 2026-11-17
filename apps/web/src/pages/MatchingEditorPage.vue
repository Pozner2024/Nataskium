<template>
  <h1 class="matching-editor-page__title">{{ heading }}</h1>
  <MatchingEditor :matching-id="matchingId" />
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useI18n, useSeoMeta } from '#imports'
import { MatchingEditor } from '@/widgets/matching-editor'

const props = defineProps<{
  matchingId?: string
}>()

const { t } = useI18n()

const heading = computed(() => t(props.matchingId === undefined ? 'teacher.matchingEditor.headingNew' : 'teacher.matchingEditor.headingEdit'))

useSeoMeta({ title: () => heading.value, robots: 'noindex, nofollow' })
</script>

<style scoped lang="scss">
@use '@/assets/styles/mixins' as *;

.matching-editor-page__title {
  @include section-title;
}
</style>
