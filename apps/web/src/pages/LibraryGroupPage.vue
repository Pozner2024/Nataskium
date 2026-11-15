<template>
  <main class="library-group-page">
    <NuxtLink class="library-group-page__back" :to="localePath(LIBRARY_PAGE_PATHS.root)">{{ t('library.allGroups') }}</NuxtLink>

    <p v-if="isUnknown" class="library-group-page__not-found" role="alert">{{ t('library.groupNotFound') }}</p>
    <!-- Список — только для известной группы: иначе неизвестный адрес успевал запросить API и получить 404 -->
    <template v-else-if="groupName !== ''">
      <h1 class="library-group-page__title">{{ groupName }}</h1>
      <LibraryBrowser :group="group" />
    </template>
  </main>
</template>

<script setup lang="ts">
import { LIBRARY_PAGE_PATHS } from '@nataskium/shared/routes'
import { computed, onMounted } from 'vue'
import { NuxtLink } from '#components'
import { useI18n, useLocalePath, useSeoMeta } from '#imports'
import { useLibraryGroups } from '@/entities/library'
import { LibraryBrowser } from '@/widgets/library-browser'

const props = defineProps<{ group: string }>()

const { t } = useI18n()
const localePath = useLocalePath()
const { groups, load } = useLibraryGroups()

const groupName = computed(() => groups.value.find((item) => item.slug === props.group)?.name ?? '')
// Список групп загружен, а такой нет — неизвестный адрес. Пока список грузится, ничего не утверждаем
const isUnknown = computed(() => groups.value.length > 0 && groupName.value === '')

useSeoMeta({ title: () => groupName.value || t('library.title') })

onMounted(load)
</script>

<style scoped lang="scss">
@use '@/assets/styles/mixins' as *;

.library-group-page {
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding: 16px var(--gutter) 32px;
}

.library-group-page__back {
  align-self: flex-start;
  display: flex;
  align-items: center;
  min-height: 44px;
  color: var(--color-blue-dark);
  font-weight: 600;
  text-decoration: none;
}

.library-group-page__title {
  @include section-title;
}

.library-group-page__not-found {
  margin: 24px 0 0;
  font-weight: 500;
  text-align: center;
}
</style>
