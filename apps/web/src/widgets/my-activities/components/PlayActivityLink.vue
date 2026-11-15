<template>
  <NuxtLink class="play-activity-link" :to="previewPath" :aria-label="t('teacher.activities.playLabel', { title })">
    <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5.5v13l11-6.5z" /></svg>
    <span class="play-activity-link__text">{{ t('teacher.activities.play') }}</span>
  </NuxtLink>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { NuxtLink } from '#components'
import { useI18n } from '#imports'
import { PREVIEW_QUERY } from '@/entities/quiz'

const props = defineProps<{
  title: string
  shareToken: string
}>()

const { t } = useI18n()

// На странице задания по этой пометке появляется кнопка «Назад»
const previewPath = computed(() => `/play/${encodeURIComponent(props.shareToken)}?${PREVIEW_QUERY}`)
</script>

<style scoped lang="scss">
.play-activity-link {
  display: flex;
  flex: 1;
  align-items: center;
  justify-content: center;
  gap: 8px;
  min-width: 0;
  min-height: 44px;
  padding: 0 12px;
  border-radius: 14px;
  background: var(--color-blue-dark);
  color: var(--color-white);
  font-weight: 700;
  line-height: 1.2;
  text-decoration: none;
  -webkit-tap-highlight-color: transparent;
  transition: transform 0.2s ease;

  &:active {
    transform: scale(0.98);
  }

  svg {
    flex: none;
    width: 20px;
    height: 20px;
    fill: currentColor;
  }
}

@media (prefers-reduced-motion: reduce) {
  .play-activity-link {
    transition: none;
  }
}
</style>
