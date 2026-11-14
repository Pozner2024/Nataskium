<template>
  <h1 class="teacher-activities-page__title">{{ t('teacher.activities.title') }}</h1>
  <MyActivities
    :activities="activities"
    :status="status"
    @edit="edit"
    @delete="askDelete"
    @retry="load"
  />
  <p v-if="isRemoveFailed" class="teacher-activities-page__error" role="alert">{{ t('teacher.activities.deleteFailed') }}</p>

  <AppDialog v-model:open="isDeleteOpen" :title="t('teacher.activities.deleteDialog.title')">
    <p class="teacher-activities-page__text">{{ t('teacher.activities.deleteDialog.text', { title: pendingDelete?.title ?? '' }) }}</p>
    <template #actions>
      <button class="teacher-activities-page__confirm" type="button" @click="confirmDelete">
        {{ t('teacher.activities.deleteDialog.confirm') }}
      </button>
      <button class="teacher-activities-page__cancel" type="button" autofocus @click="isDeleteOpen = false">
        {{ t('teacher.activities.deleteDialog.cancel') }}
      </button>
    </template>
  </AppDialog>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { navigateTo, useI18n, useLocalePath, useSeoMeta } from '#imports'
import type { Activity } from '@/entities/activity'
import { AppDialog, TEACHER_PATHS } from '@/shared'
import { MyActivities, useMyActivities } from '@/widgets/my-activities'

const { t } = useI18n()
const localePath = useLocalePath()
const { activities, status, isRemoveFailed, load, remove } = useMyActivities()

const isDeleteOpen = ref(false)
const pendingDelete = ref<Activity | null>(null)

useSeoMeta({ title: () => t('teacher.activities.title'), robots: 'noindex, nofollow' })

async function edit(activity: Activity) {
  await navigateTo(localePath(`${TEACHER_PATHS.quizEdit}/${activity.id}`))
}

function askDelete(activity: Activity) {
  pendingDelete.value = activity
  isDeleteOpen.value = true
}

async function confirmDelete() {
  const activity = pendingDelete.value
  isDeleteOpen.value = false
  if (!activity) return
  await remove(activity)
}
</script>

<style scoped lang="scss">
@use '@/assets/styles/mixins' as *;

.teacher-activities-page__title {
  @include section-title;
}

// Текст ошибки тёмный, знак оранжевый: оранжево-тёмный текст на белом дал бы 3.6:1
.teacher-activities-page__error {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  margin: 0;
  padding: 12px 14px;
  border-radius: 16px;
  background: rgb(var(--rgb-orange) / 0.14);
  font-size: 15px;
  font-weight: 500;
  line-height: 1.4;

  &::before {
    content: '!';
    content: '!' / '';
    display: grid;
    flex: none;
    place-items: center;
    width: 20px;
    height: 20px;
    margin-top: 1px;
    border-radius: 50%;
    background: var(--color-orange-dark);
    color: var(--color-white);
    font-size: 13px;
    font-weight: 700;
    line-height: 1;
  }
}

.teacher-activities-page__text {
  margin: 0;
}

%action-button {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  min-height: 48px;
  padding: 8px 16px;
  border: 0;
  border-radius: 999px;
  font: inherit;
  font-weight: 700;
  line-height: 1.25;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
  transition: background-color 0.2s ease;
}

// Тёмный текст на оранжевом: 6.23:1, как у удаления аккаунта — подпись необратимого действия должна читаться
.teacher-activities-page__confirm {
  @extend %action-button;

  background: var(--color-orange);
  color: var(--color-text);

  @media (hover: hover) {
    &:hover {
      background: var(--color-orange-light);
    }
  }

  &:active {
    background: rgb(var(--rgb-orange) / 0.8);
  }
}

.teacher-activities-page__cancel {
  @extend %action-button;

  background: rgb(var(--rgb-blue) / 0.1);
  color: var(--color-blue-dark);

  @media (hover: hover) {
    &:hover {
      background: rgb(var(--rgb-blue) / 0.16);
    }
  }

  &:active {
    background: rgb(var(--rgb-blue) / 0.24);
  }
}

@media (prefers-reduced-motion: reduce) {
  .teacher-activities-page__confirm,
  .teacher-activities-page__cancel {
    transition: none;
  }
}
</style>
