<template>
  <main class="library-quiz-page">
    <LibraryQuiz v-if="parsed" :number="parsed.number" @not-found="notFound" @loaded="title = $event" />
  </main>
</template>

<script setup lang="ts">
import { parseQuizSlug } from '@nataskium/shared/library'
import { computed, onMounted, ref } from 'vue'
import { showError, useI18n, useSeoMeta } from '#imports'
import { LibraryQuiz } from '@/widgets/library-quiz'

const props = defineProps<{ slug: string }>()

const { t } = useI18n()
const parsed = computed(() => parseQuizSlug(props.slug))

function notFound(): void {
  showError({ statusCode: 404, status: 404, statusMessage: 'Not Found' })
}

const title = ref('')

useSeoMeta({ title: () => title.value || t('library.title') })

// Мусорный адрес — сразу 404, без запроса к API
onMounted(() => {
  if (parsed.value === null) notFound()
})
</script>

<style scoped lang="scss">
.library-quiz-page {
  padding: 8px var(--gutter) 32px;
}
</style>
