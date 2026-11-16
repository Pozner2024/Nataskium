<template>
  <div v-if="groups.length > 0" class="group-select">
    <label class="group-select__label" for="quiz-group">{{ t('teacher.quizEditor.settings.group') }}</label>
    <select
      id="quiz-group"
      class="group-select__input"
      :value="modelValue"
      :disabled="disabled"
      :aria-invalid="invalid"
      :aria-describedby="invalid ? 'quiz-group-error' : undefined"
      @change="emit('change', ($event.target as HTMLSelectElement).value)"
    >
      <option v-if="modelValue === ''" value="" disabled>{{ t('teacher.quizEditor.settings.groupPlaceholder') }}</option>
      <option v-for="group in groups" :key="group.slug" :value="group.slug">{{ group.name }}</option>
    </select>
  </div>
  <div v-else-if="modelValue === '' && isFailed" class="group-select">
    <p class="group-select__error" role="alert">{{ t('teacher.quizEditor.settings.groupLoadFailed') }}</p>
    <button class="group-select__retry" type="button" @click="load">{{ t('teacher.activities.retry') }}</button>
  </div>
</template>

<script setup lang="ts">
import { onMounted } from 'vue'
import { useI18n } from '#imports'
import { useLibraryGroups } from '@/entities/library'

defineProps<{
  modelValue: string
  disabled: boolean
  invalid?: boolean
}>()

const emit = defineEmits<{
  change: [slug: string]
}>()

const { t } = useI18n()
// Список не загрузился — у сохранённого задания поле не показываем (остаётся прежняя группа),
// у нового показываем ошибку с повтором: без раздела его не сохранить
const { groups, isFailed, load } = useLibraryGroups()

onMounted(load)
</script>

<style scoped lang="scss">
@use '@/assets/styles/mixins' as *;

.group-select {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 18px 16px;
  border-radius: 22px;
  @include card-surface;
}

.group-select__label {
  font-size: 17px;
  font-weight: 700;
  line-height: 1.3;
}

.group-select__error {
  color: var(--color-orange-dark);
  font-weight: 500;
  font-size: 14px;
  line-height: 1.3;
}

.group-select__retry {
  align-self: flex-start;
  min-height: 44px;
  padding: 0 16px;
  border: 2px solid var(--color-blue-dark);
  border-radius: 14px;
  background: var(--color-white);
  color: var(--color-blue-dark);
  font: inherit;
  font-weight: 700;
  cursor: pointer;
}

.group-select__input {
  width: 100%;
  min-height: 48px;
  padding: 10px 14px;
  border: 2px solid var(--color-text-muted);
  border-radius: 14px;
  background: var(--color-white);
  color: var(--color-text);
  font: inherit;
  // 16px — меньше, и iOS Safari при фокусе увеличивает страницу
  font-size: 16px;
  cursor: pointer;

  &:focus {
    border-color: var(--color-blue-dark);
  }

  &:disabled {
    cursor: progress;
    opacity: 0.6;
  }
}
</style>
