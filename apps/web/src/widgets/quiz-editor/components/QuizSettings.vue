<template>
  <section class="quiz-settings">
    <h2 class="quiz-settings__title">{{ t('teacher.quizEditor.settings.title') }}</h2>

    <ActivitySettings :settings="store.quiz" :disabled="isSaving" :save="saveSettings" />

    <p v-if="errorMessage" class="quiz-settings__error" role="alert">{{ errorMessage }}</p>
    <p class="quiz-settings__saved" role="status">{{ savedMessage }}</p>

    <div v-if="shareUrl" class="quiz-settings__link">
      <h3 class="quiz-settings__link-title">{{ t('teacher.quizEditor.settings.link') }}</h3>
      <input class="quiz-settings__link-input" type="text" readonly :value="shareUrl" :aria-label="t('teacher.quizEditor.settings.link')" >
      <button class="quiz-settings__copy" type="button" @click="copyLink">
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1" />
        </svg>
        {{ t('teacher.quizEditor.settings.copy') }}
      </button>
      <p class="quiz-settings__copy-status" role="status">{{ copyMessage }}</p>
      <a class="quiz-settings__preview" :href="previewPath" @click.prevent="openPreview">
        {{ t('teacher.quizEditor.settings.preview') }}
      </a>
    </div>
  </section>
</template>


<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from 'vue'
import { navigateTo, useI18n } from '#imports'
import { PREVIEW_QUERY, playUrl } from '@/entities/quiz'
import { ActivitySettings, type ActivitySettingsValue } from '@/features/activity-settings'
import { useQuizEditorStore } from '../store'

// Сколько показывается «Ссылка скопирована»
const COPY_STATUS_MS = 2500

const { t } = useI18n()
const store = useQuizEditorStore()

const isSaving = computed(() => store.saveStatus === 'saving')
const errorMessage = computed(() => {
  if (store.saveStatus === 'tooLarge') return t('teacher.quizEditor.tooLarge')
  if (['invalid', 'failed'].includes(store.saveStatus)) return t('teacher.quizEditor.saveFailed')
  return ''
})
const savedMessage = computed(() => {
  if (isSaving.value) return t('teacher.quizEditor.saving')
  return store.saveStatus === 'saved' && !store.isDirty ? t('teacher.quizEditor.settings.autoSaved') : ''
})
const copyMessage = ref('')
let resetTimer: ReturnType<typeof setTimeout> | undefined

const shareUrl = computed(() => (store.shareToken ? playUrl(store.shareToken) : null))
const previewPath = computed(() => `/play/${encodeURIComponent(store.shareToken ?? '')}?${PREVIEW_QUERY}`)

async function openPreview(): Promise<void> {
  await navigateTo(previewPath.value)
}

// Изменение сразу попадает в викторину; если сохранить не удалось, изменённые поля возвращаются
async function saveSettings(patch: Partial<ActivitySettingsValue>): Promise<boolean> {
  const previous = Object.fromEntries(Object.keys(patch).map((key) => [key, store.quiz[key as keyof ActivitySettingsValue]]))
  Object.assign(store.quiz, patch)
  if (await store.save()) return true
  Object.assign(store.quiz, previous)
  return false
}

async function copyLink(): Promise<void> {
  if (shareUrl.value === null) return
  try {
    await navigator.clipboard.writeText(shareUrl.value)
    copyMessage.value = t('teacher.activities.linkCopied')
  } catch {
    copyMessage.value = t('teacher.activities.copyFailed')
  }
  clearTimeout(resetTimer)
  resetTimer = setTimeout(() => {
    copyMessage.value = ''
  }, COPY_STATUS_MS)
}

onBeforeUnmount(() => clearTimeout(resetTimer))
</script>

<style scoped lang="scss">
@use '@/assets/styles/mixins' as *;

%pill-button {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  width: 100%;
  min-height: 52px;
  padding: 8px 16px;
  border: 0;
  border-radius: 999px;
  font: inherit;
  font-weight: 700;
  line-height: 1.25;
  text-align: center;
  text-decoration: none;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
  transition:
    background-color 0.2s ease,
    box-shadow 0.2s ease,
    transform 0.2s ease;

  &:active {
    transform: scale(0.98);
  }

  svg {
    flex: none;
    width: 20px;
    height: 20px;
    fill: none;
    stroke: currentColor;
    stroke-width: 2.4;
    stroke-linecap: round;
    stroke-linejoin: round;
  }
}

.quiz-settings {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.quiz-settings__title {
  margin: 0 0 4px;
  font-size: 20px;
  font-weight: 700;
  line-height: 1.3;
}

.quiz-settings__link {
  display: flex;
  flex-direction: column;
  padding: 18px 16px;
  border-radius: 22px;
  @include card-surface;
}

// Текст ошибки тёмный, знак оранжевый: оранжево-тёмный текст на белом дал бы 3.6:1
.quiz-settings__error {
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

.quiz-settings__link-title {
  margin: 0;
  font-size: 17px;
  font-weight: 700;
  line-height: 1.3;
}

.quiz-settings__link-input {
  width: 100%;
  min-height: 48px;
  margin-top: 10px;
  padding: 10px 14px;
  border: 2px dashed rgb(var(--rgb-blue) / 0.45);
  border-radius: 14px;
  background: rgb(var(--rgb-blue) / 0.05);
  color: var(--color-text);
  font: inherit;
  font-size: 16px;
  text-overflow: ellipsis;
}

// Решение пользователя (2026-11-01): фирменный оранжевый с белым текстом, контраст 2.52:1 принят осознанно
.quiz-settings__copy {
  @extend %pill-button;

  margin-top: 14px;
  background: var(--color-orange);
  box-shadow: 0 10px 24px rgb(var(--rgb-orange) / 0.4);
  color: var(--color-white);

  @media (hover: hover) {
    &:hover {
      box-shadow: 0 14px 28px rgb(var(--rgb-orange) / 0.45);
    }
  }
}

// Пустая строка статуса остаётся в разметке (её читает скринридер), но места не занимает
.quiz-settings__copy-status {
  margin: 0;
  font-size: 15px;
  font-weight: 500;
  text-align: center;

  &:not(:empty) {
    margin-top: 8px;
  }
}

.quiz-settings__saved {
  margin: 12px 0 0;
  color: var(--color-green-dark);
  font-size: 15px;
  font-weight: 600;

  &:empty {
    display: none;
  }
}

.quiz-settings__preview {
  @extend %pill-button;

  position: relative;
  margin-top: 10px;
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
  .quiz-settings__copy,
  .quiz-settings__preview {
    transition: none;
  }

  .quiz-settings__copy:active,
  .quiz-settings__preview:active {
    transform: none;
  }
}
</style>
