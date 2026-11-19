<template>
  <h1 class="true-false-editor-page__title">{{ heading }}</h1>
  <TrueFalseEditor :true-false-id="trueFalseId" />
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useI18n, useSeoMeta } from '#imports'
import { TrueFalseEditor } from '@/widgets/true-false-editor'

const props = defineProps<{
  trueFalseId?: string
}>()

// Соединитель слов нужен только в h1, чтобы «да/нет» не рвалось на строки; во вкладке он лишний
const WORD_JOINER = String.fromCodePoint(0x2060)

const { t } = useI18n()

const heading = computed(() => t(props.trueFalseId === undefined ? 'teacher.trueFalseEditor.headingNew' : 'teacher.trueFalseEditor.headingEdit'))

useSeoMeta({ title: () => heading.value.replaceAll(WORD_JOINER, ''), robots: 'noindex, nofollow' })
</script>

<style scoped lang="scss">
@use '@/assets/styles/mixins' as *;

.true-false-editor-page__title {
  @include section-title;
}
</style>
