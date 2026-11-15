<template>
  <LibraryGroupPage :group="group" />
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from '#imports'
import LibraryGroupPage from '@/pages/LibraryGroupPage.vue'

definePageMeta({ name: 'library-group', preFooter: false })

const route = useRoute()
const group = computed(() => String(route.params.group))
</script>
