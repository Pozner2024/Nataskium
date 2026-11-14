<template>
  <div class="activity-type-picker">
    <p class="activity-type-picker__subtitle">{{ t('teacher.create.subtitle') }}</p>

    <ul class="activity-type-picker__list">
      <li v-for="type in ACTIVITY_TYPE_ORDER" :key="type">
        <button class="activity-type-picker__tile" type="button" @click="emit('select', type)">
          <ActivityTypeIcon class="activity-type-picker__icon" :type="type" />
          <span class="activity-type-picker__text">
            <span class="activity-type-picker__name">{{ t(`teacher.activityTypes.${type}.name`) }}</span>
            <span class="activity-type-picker__description">{{ t(`teacher.activityTypes.${type}.description`) }}</span>
          </span>
          <svg class="activity-type-picker__arrow" viewBox="0 0 24 24" aria-hidden="true"><path d="M9 6l6 6-6 6" /></svg>
        </button>
      </li>
    </ul>
  </div>
</template>

<script setup lang="ts">
import { useI18n } from '#imports'
import { ACTIVITY_TYPE_ORDER, ActivityTypeIcon, type ActivityType } from '@/entities/activity'

const emit = defineEmits<{
  select: [type: ActivityType]
}>()

const { t } = useI18n()
</script>

<style scoped lang="scss">
@use '@/assets/styles/mixins' as *;

.activity-type-picker {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.activity-type-picker__subtitle {
  margin: 0;
  font-size: 15px;
  line-height: 1.4;
}

.activity-type-picker__list {
  display: flex;
  flex-direction: column;
  gap: 12px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.activity-type-picker__tile {
  display: flex;
  align-items: center;
  gap: 14px;
  width: 100%;
  min-height: 88px;
  padding: 16px;
  border-radius: 22px;
  @include card-surface;
  color: var(--color-text);
  font: inherit;
  text-align: start;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
  transition:
    border-color 0.2s ease,
    transform 0.2s ease;

  @media (hover: hover) {
    &:hover {
      border-color: var(--color-blue);
    }
  }

  &:active {
    transform: scale(0.98);
  }
}

.activity-type-picker__tile .activity-type-picker__icon {
  width: 52px;
  height: 52px;
  border-radius: 16px;
}

.activity-type-picker__text {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.activity-type-picker__name {
  font-size: 18px;
  font-weight: 700;
  line-height: 1.3;
}

.activity-type-picker__description {
  color: var(--color-text-muted);
  font-size: 14px;
  line-height: 1.4;
}

.activity-type-picker__arrow {
  flex: none;
  width: 22px;
  height: 22px;
  fill: none;
  stroke: var(--color-blue-dark);
  stroke-width: 2.4;
  stroke-linecap: round;
  stroke-linejoin: round;
}

@media (prefers-reduced-motion: reduce) {
  .activity-type-picker__tile {
    transition: none;

    &:active {
      transform: none;
    }
  }
}
</style>
