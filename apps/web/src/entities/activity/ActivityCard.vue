<template>
  <article class="activity-card" :class="`activity-card--${layout}`" :aria-labelledby="titleId">
    <!-- Превью — та же ссылка, что и название: для клавиатуры и диктора она одна, на названии -->
    <NuxtLink v-if="$slots.preview && to" class="activity-card__preview activity-card__preview--link" :to="to" tabindex="-1" aria-hidden="true">
      <slot name="preview" />
    </NuxtLink>
    <div v-else-if="$slots.preview" class="activity-card__preview">
      <slot name="preview" />
    </div>
    <ActivityTypeIcon v-else :type="activity.type" />
    <div class="activity-card__info">
      <h2 :id="titleId" class="activity-card__title">
        <NuxtLink v-if="to" class="activity-card__link" :to="to">{{ activity.title }}</NuxtLink>
        <template v-else>{{ activity.title }}</template>
      </h2>
      <p class="activity-card__meta">
        {{ t(`gameTypes.${activity.type}.name`) }} · {{ t(countKey, { count: activity.questionCount }, activity.questionCount) }}
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
import { computed, useId } from 'vue'
import { NuxtLink } from '#components'
import { useI18n } from '#imports'
import ActivityTypeIcon from './ActivityTypeIcon.vue'
import type { Activity, ActivityType } from './types'

const props = withDefaults(defineProps<{
  activity: Activity
  // tile — превью над текстом (плитка), row — превью слева от текста (список)
  layout?: 'tile' | 'row'
  // Адрес, который открывают превью и название
  to?: string
}>(), { layout: 'row', to: undefined })

const { t } = useI18n()
const titleId = useId()
// У сопоставления в questionCount — число пар, у да/нет — число утверждений
const COUNT_KEYS: Record<ActivityType, string> = {
  quiz: 'teacher.activities.questions',
  matching: 'teacher.activities.pairs',
  truefalse: 'teacher.activities.statements',
}
const countKey = computed(() => COUNT_KEYS[props.activity.type])
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

.activity-card--tile {
  display: flex;
  flex-direction: column;
  gap: 12px;
  height: 100%;
  padding: 12px;
}

.activity-card--row:has(.activity-card__preview) {
  grid-template-columns: minmax(0, 1fr) minmax(0, 2fr);
  align-items: center;
  gap: 12px;
  padding: 12px;
}

.activity-card__preview {
  display: flex;
  min-width: 0;
}

.activity-card__info {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.activity-card--tile .activity-card__info {
  padding: 0 4px;
}

.activity-card__title {
  margin: 0;
  font-size: 17px;
  font-weight: 700;
  line-height: 1.3;
  overflow-wrap: anywhere;
}

.activity-card__link {
  border-radius: 4px;
  color: inherit;
  text-decoration: none;

  &:focus-visible {
    outline: 3px solid var(--color-blue-dark);
    outline-offset: 2px;
  }
}

.activity-card__preview--link {
  border-radius: 14px;
  color: inherit;
  text-decoration: none;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
}

@media (hover: hover) {
  .activity-card__link:hover,
  .activity-card:has(.activity-card__preview--link:hover) .activity-card__link {
    text-decoration: underline;
  }
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
  flex-wrap: wrap;
  grid-column: 1 / -1;
  gap: 8px;
  margin-top: 10px;
}

// Кнопки прижаты к низу: в ряду плиток с заголовками разной длины они стоят на одной линии
.activity-card--tile .activity-card__actions {
  margin-top: auto;
}
</style>
