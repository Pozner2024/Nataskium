<template>
  <MyActivities
    :activities="activities"
    :status="status"
    @edit="edit"
    @delete="askDelete"
    @retry="load"
  />
  <p v-if="isRemoveFailed" class="manage-activities__error" role="alert">{{ t('teacher.activities.deleteFailed') }}</p>

  <AppConfirmDialog
    v-model:open="isDeleteOpen"
    :title="t('teacher.activities.deleteDialog.title')"
    :text="t('teacher.activities.deleteDialog.text', { title: pendingDelete?.title ?? '' })"
    :confirm-label="t('teacher.activities.deleteDialog.confirm')"
    :cancel-label="t('teacher.activities.deleteDialog.cancel')"
    @confirm="confirmDelete"
  />
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { navigateTo, useI18n, useLocalePath } from '#imports'
import type { Activity } from '@/entities/activity'
import { AppConfirmDialog, TEACHER_PATHS } from '@/shared'
import MyActivities from './MyActivities.vue'
import { useMyActivities } from './useMyActivities'

const { t } = useI18n()
const localePath = useLocalePath()
const { activities, status, isRemoveFailed, load, remove } = useMyActivities()

const isDeleteOpen = ref(false)
const pendingDelete = ref<Activity | null>(null)

async function edit(activity: Activity) {
  await navigateTo(localePath(`${TEACHER_PATHS.quizEdit}/${activity.id}`))
}

function askDelete(activity: Activity) {
  pendingDelete.value = activity
  isDeleteOpen.value = true
}

async function confirmDelete() {
  if (!pendingDelete.value) return
  await remove(pendingDelete.value)
}
</script>

<style scoped lang="scss">
// Текст ошибки тёмный, знак оранжевый: оранжево-тёмный текст на белом дал бы 3.6:1
.manage-activities__error {
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
</style>
