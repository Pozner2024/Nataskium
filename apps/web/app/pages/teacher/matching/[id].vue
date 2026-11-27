<template>
  <MatchingEditorPage :matching-id="String(route.params.id)" />
</template>

<script setup lang="ts">
import { useRoute } from '#imports'
import MatchingEditorPage from '@/pages/MatchingEditorPage.vue'

const route = useRoute()

definePageMeta({ name: 'teacher-matching-edit', layout: 'teacher', middleware: 'teacher-auth', key: (route) => String(route.params.id) })
</script>
