<template>
  <LibraryQuizPage :key="slug" :slug="slug" />
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from '#imports'
import LibraryQuizPage from '@/pages/LibraryQuizPage.vue'

definePageMeta({ name: 'library-quiz', preFooter: false })

const route = useRoute()
// key на странице в шаблоне: при переходе на другое задание она создаётся заново, и карточка, заголовок
// и проверка адреса идут с нуля
const slug = computed(() => String(route.params.slug))
</script>
