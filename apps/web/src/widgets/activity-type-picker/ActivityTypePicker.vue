<template>
  <div class="activity-type-picker">
    <p class="activity-type-picker__subtitle">{{ t('teacher.create.subtitle') }}</p>

    <ul class="activity-type-picker__list">
      <li v-for="type in ACTIVITY_TYPE_ORDER" :key="type">
        <GameTypeCard :type="type" @select="emit('select', type)" />
      </li>
    </ul>
  </div>
</template>

<script setup lang="ts">
import { useI18n } from '#imports'
import { ACTIVITY_TYPE_ORDER, GameTypeCard, type ActivityType } from '@/entities/activity'

const emit = defineEmits<{
  select: [type: ActivityType]
}>()

const { t } = useI18n()
</script>

<style scoped lang="scss">
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
</style>
