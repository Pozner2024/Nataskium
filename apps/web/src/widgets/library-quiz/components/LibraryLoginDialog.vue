<template>
  <AppDialog :open="open" :title="t('library.take.login.title')" @update:open="onUpdateOpen">
    <p class="library-login-dialog__text">{{ t('library.take.login.text') }}</p>
    <template #actions>
      <AppButton :to="loginHref">{{ t('library.take.login.login') }}</AppButton>
      <AppButton color="blue" :to="registerTo">{{ t('library.take.login.register') }}</AppButton>
      <button class="library-login-dialog__close" type="button" @click="emit('close')">{{ t('library.take.login.close') }}</button>
    </template>
  </AppDialog>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, watch } from 'vue'
import type { RouteLocationRaw } from 'vue-router'
import { useI18n, useRouter } from '#imports'
import { AppButton, AppDialog } from '@/shared'

const props = defineProps<{
  open: boolean
  loginTo: RouteLocationRaw
  registerTo: string
}>()

const emit = defineEmits<{ close: [] }>()

const { t } = useI18n()
const router = useRouter()

// AppButton принимает адрес строкой: объект с query превращаем в готовый href
const loginHref = computed(() => router.resolve(props.loginTo).href)

function onUpdateOpen(value: boolean) {
  if (!value) emit('close')
}

// Страница под окном не прокручивается; снимаем блокировку и при закрытии, и при уходе со страницы
const SCROLL_LOCK_CLASS = 'is-scroll-locked'

function setScrollLock(locked: boolean) {
  document.documentElement.classList.toggle(SCROLL_LOCK_CLASS, locked)
}

watch(() => props.open, setScrollLock)
onBeforeUnmount(() => setScrollLock(false))
</script>

<style scoped lang="scss">
.library-login-dialog__text {
  margin: 0;
  line-height: 1.45;
}

.library-login-dialog__close {
  min-height: 44px;
  padding: 0 14px;
  border: 0;
  border-radius: 999px;
  background: transparent;
  color: var(--color-blue-dark);
  font: inherit;
  font-weight: 700;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
  transition: background-color 0.2s ease;

  @media (hover: hover) {
    &:hover {
      background: rgb(var(--rgb-blue) / 0.1);
    }
  }

  &:active {
    background: rgb(var(--rgb-blue) / 0.18);
  }

  @media (prefers-reduced-motion: reduce) {
    transition: none;
  }
}

:global(html.is-scroll-locked) {
  overflow: hidden;
}
</style>
