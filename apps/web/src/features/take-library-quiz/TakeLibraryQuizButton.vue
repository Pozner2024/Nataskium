<template>
  <div class="take-library-quiz-button" :class="{ 'take-library-quiz-button--compact': compact }">
    <!-- Компактная кнопка для карточки списка: AppButton слишком широк и высок для плитки -->
    <button v-if="compact" ref="compactButton" class="take-library-quiz-button__compact" type="button" :disabled="isDisabled" @click="run">
      {{ compactLabel }}
    </button>
    <AppButton v-else ref="button" :disabled="isDisabled" @click="run">{{ label }}</AppButton>

    <!-- Блок есть всегда, меняется только текст: созданный позже live-регион часть экранных чтецов не озвучивает -->
    <p class="take-library-quiz-button__sr-only" role="status">{{ progressText }}</p>

    <div v-if="errorText" class="take-library-quiz-button__error" role="alert">
      <div class="take-library-quiz-button__message">
        <span class="take-library-quiz-button__icon" aria-hidden="true">⚠</span>
        <p class="take-library-quiz-button__text take-library-quiz-button__text--error">{{ errorText }}</p>
      </div>
      <NuxtLink v-if="status === 'limit'" class="take-library-quiz-button__link" :to="localePath(TEACHER_PATHS.activities)">
        {{ t('library.take.toMyActivities') }}
      </NuxtLink>
      <NuxtLink v-if="status === 'notFound'" class="take-library-quiz-button__link" :to="localePath(LIBRARY_PAGE_PATHS.root)">
        {{ t('library.take.toLibrary') }}
      </NuxtLink>
    </div>
  </div>
</template>

<script setup lang="ts">
import { LIBRARY_PAGE_PATHS } from '@nataskium/shared/routes'
import { MAX_QUIZZES_PER_TEACHER } from '@nataskium/shared/schemas'
import { computed, nextTick, useTemplateRef, watch } from 'vue'
import { NuxtLink } from '#components'
import { useI18n, useLocalePath } from '#imports'
import { AppButton, TEACHER_PATHS } from '@/shared'
import type { TakeStatus, TakenQuiz } from './types'
import { useTakeLibraryQuiz } from './useTakeLibraryQuiz'

// Ошибки, после которых кнопка снова включается: на время копирования она выключена, и фокус с клавиатуры терялся
const RETRYABLE_STATUSES: readonly TakeStatus[] = ['limit', 'storage', 'busy', 'network', 'failed']

const props = defineProps<{
  isSignedIn: boolean
  // Сессия проверена: пока нет, кнопка выключена, чтобы гостя не приняли за вошедшего
  isReady: boolean
  take: () => Promise<TakenQuiz>
  // Карточка в списке библиотеки: кнопка по ширине карточки, короткий ярлык и мелкий текст ошибки
  compact?: boolean
}>()

const emit = defineEmits<{ taken: [quizId: string]; 'login-required': [] }>()

const { t } = useI18n()
const localePath = useLocalePath()
const button = useTemplateRef<{ $el: HTMLElement }>('button')
const compactButton = useTemplateRef<HTMLButtonElement>('compactButton')

const { status, isBusy, run } = useTakeLibraryQuiz({
  isSignedIn: () => props.isSignedIn,
  take: () => props.take(),
  onTaken: (quizId) => emit('taken', quizId),
  onLoginRequired: () => emit('login-required'),
})

watch(status, async (value) => {
  if (!RETRYABLE_STATUSES.includes(value)) return
  await nextTick()
  if (props.compact) compactButton.value?.focus()
  else button.value?.$el.focus()
})

const isDisabled = computed(() => !props.isReady || isBusy.value || status.value === 'notFound')

const label = computed(() => {
  if (status.value === 'taking') return t('library.take.taking')
  if (status.value === 'taken') return t('library.take.taken')
  return t('library.take.button')
})

// В карточке полный текст «Готово! Открываем…» не помещается: на кнопке короткий, экранный чтец слышит полный
const compactLabel = computed(() => (status.value === 'taken' ? t('library.take.takenShort') : label.value))

// Видимый текст уже на самой кнопке; отдельная строка только для озвучивания экранным чтецом
const progressText = computed(() => (isBusy.value ? label.value : ''))

const errorText = computed(() => {
  switch (status.value) {
    case 'limit':
      return t('library.take.errors.limit', { max: MAX_QUIZZES_PER_TEACHER })
    case 'storage':
    case 'busy':
    case 'network':
    case 'notFound':
    case 'failed':
      return t(`library.take.errors.${status.value}`)
    default:
      return ''
  }
})
</script>

<style scoped lang="scss">
.take-library-quiz-button {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 10px;
}

.take-library-quiz-button__sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip-path: inset(50%);
  white-space: nowrap;
}

.take-library-quiz-button__error {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.take-library-quiz-button__message {
  display: flex;
  align-items: flex-start;
  gap: 6px;
}

.take-library-quiz-button__icon {
  flex: none;
  line-height: 1.4;
}

.take-library-quiz-button__text {
  margin: 0;
  color: var(--color-text-muted);
  font-size: 15px;
  line-height: 1.4;
}

// Не только цвет: ошибку выделяют жирность и значок
.take-library-quiz-button__text--error {
  color: var(--color-text);
  font-weight: 600;
}

.take-library-quiz-button__link {
  display: flex;
  align-items: center;
  min-height: 44px;
  color: var(--color-blue-dark);
  font-weight: 600;
}

.take-library-quiz-button--compact {
  align-items: stretch;
  gap: 6px;

  .take-library-quiz-button__text {
    font-size: 13px;
    overflow-wrap: anywhere;
  }

  .take-library-quiz-button__link {
    font-size: 13px;
    overflow-wrap: anywhere;
  }
}

.take-library-quiz-button__compact {
  width: 100%;
  min-height: 44px;
  padding: 6px 12px;
  border: 0;
  border-radius: 14px;
  background: rgb(var(--rgb-orange) / 0.16);
  color: var(--color-text);
  font: inherit;
  font-size: 15px;
  font-weight: 700;
  line-height: 1.2;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
  transition: background-color 0.2s ease;

  @media (hover: hover) {
    &:hover:not(:disabled) {
      background: rgb(var(--rgb-orange) / 0.26);
    }
  }

  &:active:not(:disabled) {
    background: rgb(var(--rgb-orange) / 0.34);
  }

  &:focus-visible {
    outline: 3px solid var(--focus-color);
    outline-offset: 2px;
  }

  &:disabled {
    cursor: not-allowed;
    opacity: 0.6;
  }

  @media (prefers-reduced-motion: reduce) {
    transition: none;
  }
}
</style>
