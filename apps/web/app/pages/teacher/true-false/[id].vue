<template>
  <TrueFalseEditorPage :true-false-id="String(route.params.id)" />
</template>

<script setup lang="ts">
import { useRoute } from '#imports'
import TrueFalseEditorPage from '@/pages/TrueFalseEditorPage.vue'

const route = useRoute()

definePageMeta({ name: 'teacher-true-false-edit', layout: 'teacher', middleware: 'teacher-auth', key: (route) => String(route.params.id) })
</script>
