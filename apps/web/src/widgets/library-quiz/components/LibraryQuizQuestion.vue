<template>
  <article class="library-quiz-question">
    <h3 class="library-quiz-question__number">{{ t('library.quiz.questionNumber', { n: number }) }}</h3>
    <p v-if="question.text" class="library-quiz-question__text">{{ question.text }}</p>

    <div v-if="question.imageUrl && !isBroken(question.imageUrl)" class="library-quiz-question__image">
      <img class="library-quiz-question__backdrop" :src="question.imageUrl" alt="" aria-hidden="true" loading="lazy">
      <img
        class="library-quiz-question__image-img"
        :src="question.imageUrl"
        alt=""
        loading="lazy"
        @error="markBroken(question.imageUrl)"
      >
    </div>

    <ul class="library-quiz-question__options">
      <li v-for="(option, position) in question.options" :key="position" class="library-quiz-question__option">
        <span v-if="option.imageUrl" class="library-quiz-question__option-image">
          <span v-if="isBroken(option.imageUrl)" class="library-quiz-question__option-fallback">{{ t('play.imageFailed') }}</span>
          <template v-else>
            <img class="library-quiz-question__backdrop" :src="option.imageUrl" alt="" aria-hidden="true" loading="lazy">
            <img
              class="library-quiz-question__option-img"
              :src="option.imageUrl"
              alt=""
              loading="lazy"
              @error="markBroken(option.imageUrl)"
            >
          </template>
        </span>
        <span v-if="option.text" class="library-quiz-question__option-text">{{ option.text }}</span>
      </li>
    </ul>
  </article>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { useI18n } from '#imports'
import type { LibraryQuizCard } from '@/entities/library'

defineProps<{
  number: number
  question: LibraryQuizCard['questions'][number]
}>()

const { t } = useI18n()

// Картинки, которые не открылись: у вопроса блок скрывается, у варианта остаётся заглушка
const brokenImages = ref(new Set<string>())

function isBroken(url: string): boolean {
  return brokenImages.value.has(url)
}

function markBroken(url: string): void {
  brokenImages.value.add(url)
}
</script>

<style scoped lang="scss">
@use '@/assets/styles/mixins' as *;

$question-image-max-height: 34vh;
$backdrop-blur: 18px;

.library-quiz-question {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 16px;
  border-radius: 22px;
  @include card-surface;
}

.library-quiz-question__number {
  align-self: flex-start;
  margin: 0;
  padding: 2px 10px;
  border-radius: 999px;
  background: rgb(var(--rgb-blue) / 0.12);
  color: var(--color-blue-dark);
  font-size: 13px;
  font-weight: 700;
  line-height: 1.5;
}

.library-quiz-question__text {
  margin: 0;
  font-size: 17px;
  font-weight: 700;
  line-height: 1.35;
  overflow-wrap: anywhere;
}

.library-quiz-question__image {
  position: relative;
  width: min(100%, #{$question-image-max-height} * 16 / 9);
  aspect-ratio: 16 / 9;
  margin-inline: auto;
  border: 1px solid rgb(var(--rgb-blue) / 0.16);
  border-radius: 16px;
  overflow: hidden;
  background: rgb(var(--rgb-blue) / 0.06);
}

.library-quiz-question__image-img,
.library-quiz-question__option-img {
  position: absolute;
  inset: 0;
  display: block;
  width: 100%;
  height: 100%;
  object-fit: contain;
}

// Картинка показывается целиком, пустые поля по краям закрывает её размытая затемнённая копия
.library-quiz-question__backdrop {
  position: absolute;
  inset: 0;
  display: block;
  width: 100%;
  height: 100%;
  object-fit: cover;
  filter: blur($backdrop-blur) brightness(0.75);
  transform: scale(1.15);
}

.library-quiz-question__options {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.library-quiz-question__option {
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-height: 44px;
  padding: 10px 14px;
  border: 2px solid rgb(var(--rgb-blue) / 0.2);
  border-radius: 14px;
  background: var(--color-white);
  justify-content: center;
}

.library-quiz-question__option-text {
  min-width: 0;
  font-size: 16px;
  line-height: 1.35;
  overflow-wrap: anywhere;
}

.library-quiz-question__option-image {
  position: relative;
  display: block;
  width: 100%;
  max-width: 160px;
  aspect-ratio: 1;
  border-radius: 10px;
  overflow: hidden;
  background: rgb(var(--rgb-blue) / 0.06);
}

.library-quiz-question__option-fallback {
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
  padding: 8px;
  border: 2px dashed rgb(var(--rgb-blue) / 0.3);
  border-radius: inherit;
  color: var(--color-text-muted);
  font-size: 13px;
  text-align: center;
}
</style>
