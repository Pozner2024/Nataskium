<template>
  <article class="activity-card" :aria-labelledby="titleId">
    <ActivityTypeIcon :type="activity.type" />
    <div class="activity-card__info">
      <h2 :id="titleId" class="activity-card__title">{{ activity.title }}</h2>
      <p class="activity-card__meta">
        {{ t(`teacher.activityTypes.${activity.type}.name`) }} · {{ t('teacher.activities.questions', { count: activity.questionCount }) }}
      </p>
      <p class="activity-card__grade" :class="{ 'activity-card__grade--none': !activity.gradingScale }">
        {{ activity.gradingScale ? t('teacher.activities.grade', { scale: t(`teacher.gradingScales.${activity.gradingScale}`) }) : t('teacher.activities.noGrade') }}
      </p>
    </div>
    <div v-if="$slots.actions" class="activity-card__actions">
      <slot name="actions" :title-id="titleId" />
    </div>
  </article>
</template>

<script setup lang="ts">
import { useId } from 'vue'
import { useI18n } from '#imports'
import ActivityTypeIcon from './ActivityTypeIcon.vue'
import type { Activity } from './types'

defineProps<{
  activity: Activity
}>()

const { t } = useI18n()
const titleId = useId()
</script>

<style scoped lang="scss">
@use '@/assets/styles/mixins' as *;

.activity-card {
  display: grid;
  grid-template-columns: auto 1fr;
  gap: 4px 14px;
  padding: 16px;
  border-radius: 22px;
  @include card-surface;
}

.activity-card__info {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.activity-card__title {
  margin: 0;
  font-size: 17px;
  font-weight: 700;
  line-height: 1.3;
  overflow-wrap: anywhere;
}

.activity-card__meta {
  margin: 0;
  color: var(--color-text-muted);
  font-size: 14px;
}

.activity-card__grade {
  align-self: flex-start;
  margin: 4px 0 0;
  padding: 2px 10px;
  border-radius: 999px;
  background: rgb(var(--rgb-green) / 0.16);
  font-size: 13px;
  font-weight: 500;
}

.activity-card__grade--none {
  background: rgb(var(--rgb-blue) / 0.1);
  color: var(--color-text-muted);
}

.activity-card__actions {
  display: flex;
  grid-column: 1 / -1;
  gap: 8px;
  margin-top: 10px;
}
</style>
