<template>
  <main class="error-page">
    <NatGear compact />
    <p v-if="status" class="error-page__code">{{ status }}</p>
    <h1 class="error-page__title">{{ text.title }}</h1>
    <p class="error-page__description">{{ text.description }}</p>
    <AppButton color="blue" to="/">На главную</AppButton>
  </main>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useSeoMeta } from '#imports'
import { AppButton, NatGear } from '@/shared'

const props = defineProps<{
  status?: number
}>()

const NOT_FOUND_CODE = 404

// Текст ошибки с сервера не показываем: в нём могут быть внутренние детали
const NOT_FOUND_TEXT = {
  title: 'Такой страницы нет',
  description: 'Возможно, ссылка устарела или в ней опечатка.',
}
const SERVER_ERROR_TEXT = {
  title: 'Что-то пошло не так',
  description: 'Нат уже чинит. Попробуйте зайти чуть позже.',
}

const text = computed(() => (props.status === NOT_FOUND_CODE ? NOT_FOUND_TEXT : SERVER_ERROR_TEXT))

useSeoMeta({ title: () => text.value.title, robots: 'noindex, nofollow' })
</script>

<style scoped lang="scss">
.error-page {
  display: flex;
  flex: 1;
  flex-direction: column;
  align-items: center;
  padding: 32px 20px 48px;
  text-align: center;
  background: var(--color-white);
}

.error-page__code {
  margin: 16px 0 0;
  color: var(--color-blue-dark);
  font-family: var(--font-display);
  font-size: 18px;
  font-weight: 700;
}

.error-page__title {
  margin: 12px 0;
  color: var(--color-text);
  font-family: var(--font-display);
  font-size: 26px;
  line-height: 1.1;
}

.error-page__description {
  margin: 0 0 32px;
  color: var(--color-text-muted);
  line-height: 1.6;
}
</style>
