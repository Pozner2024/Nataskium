<template>
  <div class="my-activities">
    <template v-if="activities.length > 0">
      <NuxtLink class="my-activities__create" :to="localePath(TEACHER_PATHS.create)">
        <span class="my-activities__create-icon" aria-hidden="true">
          <svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14" /></svg>
        </span>
        <span class="my-activities__create-text">
          <span class="my-activities__create-title">{{ t('teacher.activities.create') }}</span>
          <span class="my-activities__create-hint">{{ t('teacher.activities.createHint') }}</span>
        </span>
      </NuxtLink>

      <ul class="my-activities__list">
        <li v-for="activity in activities" :key="activity.id">
          <ActivityCard :activity="activity">
            <template #actions>
              <ShareLinkButton :title="activity.title" :status="statusOf(activity.id)" @copy="copyLink(activity)" />
              <ActivityMenu :title="activity.title" @edit="emit('edit', activity)" @delete="emit('delete', activity)" />
            </template>
          </ActivityCard>
        </li>
      </ul>

      <p class="my-activities__status" role="status">{{ announcement }}</p>
    </template>

    <AppEmptyState v-else :title="t('teacher.activities.emptyTitle')" :text="t('teacher.activities.emptyText')">
      <template #nat>
        <NatCards compact />
      </template>
      <template #actions>
        <AppButton :to="localePath(TEACHER_PATHS.create)">{{ t('teacher.activities.create') }}</AppButton>
        <NuxtLink class="my-activities__library" :to="localePath(TEACHER_PATHS.library)">
          {{ t('teacher.activities.openLibrary') }}
        </NuxtLink>
      </template>
    </AppEmptyState>
  </div>
</template>

<script setup lang="ts">
import { onBeforeUnmount, ref } from 'vue'
import { NuxtLink } from '#components'
import { useI18n, useLocalePath } from '#imports'
import { ActivityCard, type Activity } from '@/entities/activity'
import { AppButton, AppEmptyState, NatCards, TEACHER_PATHS } from '@/shared'
import ActivityMenu from './components/ActivityMenu.vue'
import ShareLinkButton from './components/ShareLinkButton.vue'
import type { ShareLinkStatus } from './types'

defineProps<{
  activities: Activity[]
}>()

const emit = defineEmits<{
  edit: [activity: Activity]
  delete: [activity: Activity]
}>()

// Сколько кнопка показывает «Ссылка скопирована» перед возвратом к обычной подписи
const COPY_STATUS_MS = 2500

const { t } = useI18n()
const localePath = useLocalePath()

const copied = ref<{ id: string; status: ShareLinkStatus } | null>(null)
const announcement = ref('')
let resetTimer: ReturnType<typeof setTimeout> | undefined

function statusOf(id: string): ShareLinkStatus {
  return copied.value?.id === id ? copied.value.status : 'idle'
}

// Адрес игры ученика: страницы /play ещё нет, формат уточнится вместе с ней
function shareUrl(activity: Activity): string {
  return `${window.location.origin}/play/${activity.shareToken}`
}

async function copyLink(activity: Activity) {
  let status: ShareLinkStatus = 'copied'
  try {
    await navigator.clipboard.writeText(shareUrl(activity))
  } catch {
    status = 'failed'
  }
  copied.value = { id: activity.id, status }
  announcement.value = status === 'copied' ? t('teacher.activities.linkCopied') : t('teacher.activities.copyFailed')
  clearTimeout(resetTimer)
  resetTimer = setTimeout(() => {
    copied.value = null
    announcement.value = ''
  }, COPY_STATUS_MS)
}

onBeforeUnmount(() => clearTimeout(resetTimer))
</script>

<style scoped lang="scss">
.my-activities {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.my-activities__create {
  display: flex;
  align-items: center;
  gap: 14px;
  min-height: 76px;
  padding: 14px 16px;
  border: 2px dashed rgb(var(--rgb-orange) / 0.7);
  border-radius: 22px;
  background: var(--color-white);
  color: var(--color-text);
  text-decoration: none;
  transition: background-color 0.2s ease;

  &:hover {
    background: rgb(var(--rgb-orange) / 0.06);
  }

  &:active {
    background: rgb(var(--rgb-orange) / 0.12);
  }
}

.my-activities__create-icon {
  display: grid;
  flex: none;
  place-items: center;
  width: 48px;
  height: 48px;
  border-radius: 16px;
  background: var(--color-orange);
  box-shadow: 0 8px 18px rgb(var(--rgb-orange) / 0.35);

  svg {
    width: 26px;
    height: 26px;
    fill: none;
    stroke: var(--color-white);
    stroke-width: 2.6;
    stroke-linecap: round;
  }
}

.my-activities__create-text {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.my-activities__create-title {
  font-size: 17px;
  font-weight: 700;
}

.my-activities__create-hint {
  color: var(--color-text-muted);
  font-size: 14px;
}

.my-activities__list {
  display: flex;
  flex-direction: column;
  gap: 12px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.my-activities__status {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip-path: inset(50%);
  white-space: nowrap;
}

.my-activities__library {
  display: flex;
  align-items: center;
  min-height: 44px;
  padding: 0 12px;
  border-radius: 14px;
  color: var(--color-blue-dark);
  font-weight: 500;
}

@media (prefers-reduced-motion: reduce) {
  .my-activities__create {
    transition: none;
  }
}
</style>
