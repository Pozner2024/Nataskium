<template>
  <span class="activity-thumbnail">
    <span class="activity-thumbnail__body" :class="`activity-thumbnail__body--${thumbnail.type}`">
      <template v-if="thumbnail.type === 'quiz'">
        <img
          v-if="thumbnail.imageUrl && !isImageBroken"
          class="activity-thumbnail__image"
          :src="thumbnail.imageUrl"
          alt=""
          loading="lazy"
          @error="isImageBroken = true"
        >
        <span class="activity-thumbnail__text">{{ thumbnail.text }}</span>
        <span class="activity-thumbnail__options">
          <span v-for="(option, position) in thumbnail.options" :key="position" class="activity-thumbnail__option">{{ option.text }}</span>
        </span>
      </template>

      <template v-else-if="thumbnail.type === 'truefalse'">
        <span class="activity-thumbnail__text">{{ thumbnail.statement }}</span>
        <span class="activity-thumbnail__options">
          <span class="activity-thumbnail__option activity-thumbnail__option--yes">{{ t('library.thumbnail.yes') }}</span>
          <span class="activity-thumbnail__option activity-thumbnail__option--no">{{ t('library.thumbnail.no') }}</span>
        </span>
      </template>

      <template v-else>
        <!-- Слова не показываются: их связь с определениями — ответ (ADR-0013) -->
        <span class="activity-thumbnail__terms">
          <span v-for="position in thumbnail.definitions.length" :key="position" class="activity-thumbnail__term" />
        </span>
        <span v-for="(definition, position) in thumbnail.definitions" :key="position" class="activity-thumbnail__definition">
          {{ definition }}
        </span>
      </template>
    </span>
  </span>
</template>

<script setup lang="ts">
import type { LibraryThumbnail } from '@nataskium/shared/schemas'
import { ref } from 'vue'
import { useI18n } from '#imports'

// Рамку визуального стиля (IntroThemePreview) надевает виджет: сущности друг друга не импортируют
defineProps<{
  thumbnail: LibraryThumbnail
}>()

const { t } = useI18n()

const isImageBroken = ref(false)
</script>

<style scoped lang="scss">
// Превью задания для библиотеки и «Моих заданий».
// Размеры — от ширины карточки (cqw): одна миниатюра и во всю ширину плитки, и в узкой колонке списка.
// cqw считаются от контейнера-предка, поэтому контейнер — внешний элемент, а раскладка с отступами — внутренний
$text-size: 7cqw;
$option-size: 5.5cqw;
$gap: 4cqw;
$radius: 2cqw;

.activity-thumbnail {
  container-type: inline-size;
  display: flex;
  flex: 1;
  min-height: 0;
}

.activity-thumbnail__body {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: $gap;
  min-width: 0;
  min-height: 0;
  color: var(--preview-text);
  font-weight: 600;
  line-height: 1.25;
  overflow-wrap: anywhere;
}

.activity-thumbnail__image {
  flex: 1;
  min-height: 0;
  width: 100%;
  object-fit: contain;
}

.activity-thumbnail__text {
  display: -webkit-box;
  overflow: hidden;
  font-size: $text-size;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
  line-clamp: 2;
}

.activity-thumbnail__body--truefalse .activity-thumbnail__text {
  flex: 1;
  -webkit-line-clamp: 3;
  line-clamp: 3;
}

.activity-thumbnail__options {
  display: grid;
  flex: 1;
  grid-template-columns: 1fr 1fr;
  gap: $gap;
  min-height: 0;
}

.activity-thumbnail__body--truefalse .activity-thumbnail__options {
  flex: none;
}

%plate {
  overflow: hidden;
  border: 1px solid var(--preview-line);
  border-radius: $radius;
  background: var(--preview-surface);
}

.activity-thumbnail__option {
  @extend %plate;

  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0 $radius;
  font-size: $option-size;
  text-align: center;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.activity-thumbnail__option--yes {
  border-color: var(--color-green);
  background: rgb(var(--rgb-green) / 0.3);
}

.activity-thumbnail__option--no {
  border-color: var(--color-orange);
  background: rgb(var(--rgb-orange) / 0.3);
}

.activity-thumbnail__terms {
  display: grid;
  flex: none;
  grid-template-columns: repeat(3, 1fr);
  gap: $gap;
}

.activity-thumbnail__term {
  @extend %plate;

  height: 9cqw;
}

.activity-thumbnail__definition {
  display: -webkit-box;
  flex: none;
  overflow: hidden;
  padding-bottom: 1cqw;
  border-bottom: 1px solid var(--preview-line);
  font-size: $option-size;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
  line-clamp: 2;
}
</style>
