<template>
  <PlayPage :address="{ kind: 'library', slug }" />
</template>

<script setup lang="ts">
import { parseQuizSlug } from '@nataskium/shared/library'
import { useRoute } from '#imports'
import PlayPage from '@/pages/PlayPage.vue'

// Ключ — номер задания: исправление slug (replace) не пересоздаёт страницу, переход на другое задание — пересоздаёт
definePageMeta({
  name: 'library-quiz',
  layout: 'play',
  key: (route) => String(parseQuizSlug(String(route.params.slug))?.number ?? route.params.slug),
})

const route = useRoute()
const slug = String(route.params.slug)
</script>
