<template>
  <section class="quiz-settings">
    <h2 class="quiz-settings__title">{{ t('teacher.quizEditor.settings.title') }}</h2>

    <GroupSelect :model-value="store.quiz.group" :disabled="isSaving" @change="chooseGroup" />

    <div class="quiz-settings__row">
      <label class="quiz-settings__switch-label" for="quiz-show-answers">
        {{ t('teacher.quizEditor.settings.showAnswers') }}
      </label>
      <input
        id="quiz-show-answers"
        class="quiz-settings__switch"
        type="checkbox"
        role="switch"
        :checked="store.quiz.showAnswers"
        :disabled="isSaving"
        aria-describedby="quiz-show-answers-hint"
        @change="setShowAnswers"
      >
      <p id="quiz-show-answers-hint" class="quiz-settings__hint">{{ t('teacher.quizEditor.settings.showAnswersHint') }}</p>
    </div>

    <div class="quiz-settings__row">
      <label class="quiz-settings__switch-label" for="quiz-grading">{{ t('teacher.quizEditor.settings.grading') }}</label>
      <input
        id="quiz-grading"
        class="quiz-settings__switch"
        type="checkbox"
        role="switch"
        :checked="isGradingOpen"
        :disabled="isSaving"
        aria-describedby="quiz-grading-hint"
        @change="toggleGrading"
      >
      <p id="quiz-grading-hint" class="quiz-settings__hint">{{ t('teacher.quizEditor.settings.gradingHint') }}</p>

      <fieldset v-if="isGradingOpen" class="quiz-settings__scales">
        <legend class="quiz-settings__legend">{{ t('teacher.quizEditor.settings.scale') }}</legend>
        <label v-for="scale in GRADING_SCALE_TYPES" :key="scale" class="quiz-settings__scale">
          <input
            class="quiz-settings__scale-input"
            type="radio"
            name="quiz-scale"
            :value="scale"
            :checked="store.quiz.gradingScale === scale"
            :disabled="isSaving"
            @change="chooseScale(scale)"
          >
          <span class="quiz-settings__scale-name">{{ t(`teacher.gradingScales.${scale}`) }}</span>
        </label>
      </fieldset>

      <table v-if="store.quiz.gradingScale" class="quiz-settings__thresholds">
        <caption class="quiz-settings__caption">{{ t('teacher.quizEditor.settings.thresholds') }}</caption>
        <tbody>
          <!-- Оценка в строке, а не в столбце: десять столбцов 10-балльной шкалы не помещаются на телефоне -->
          <tr v-for="threshold in thresholds" :key="threshold.label">
            <th scope="row">{{ threshold.label }}</th>
            <td>{{ t('teacher.quizEditor.settings.from', { percent: threshold.minPercent }) }}</td>
          </tr>
        </tbody>
      </table>
    </div>

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
import { GRADING_SCALES, GRADING_SCALE_TYPES, type GradingScaleType } from '@nataskium/shared/grading'
import { computed, onBeforeUnmount, ref } from 'vue'
import { navigateTo, useI18n } from '#imports'
import { PREVIEW_QUERY, playUrl } from '@/entities/quiz'
import { useQuizEditorStore } from '../store'
import GroupSelect from './GroupSelect.vue'

// Сколько показывается «Ссылка скопирована»
const COPY_STATUS_MS = 2500

const { t } = useI18n()
const store = useQuizEditorStore()

const isSaving = computed(() => store.saveStatus === 'saving')
const thresholds = computed(() => (store.quiz.gradingScale ? GRADING_SCALES[store.quiz.gradingScale] : []))
// Включить оценку без шкалы нельзя: переключатель только открывает выбор, в викторине шкала появляется с выбором
const isGradingOpen = ref(store.quiz.gradingScale !== null)
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

async function setShowAnswers(event: Event): Promise<void> {
  const previous = store.quiz.showAnswers
  store.quiz.showAnswers = (event.target as HTMLInputElement).checked
  if (!(await store.save())) store.quiz.showAnswers = previous
}

async function toggleGrading(event: Event): Promise<void> {
  const previousScale = store.quiz.gradingScale
  isGradingOpen.value = (event.target as HTMLInputElement).checked
  if (isGradingOpen.value) return
  store.quiz.gradingScale = null
  if (await store.save()) return
  store.quiz.gradingScale = previousScale
  isGradingOpen.value = previousScale !== null
}

async function chooseGroup(slug: string): Promise<void> {
  const previous = store.quiz.group
  store.quiz.group = slug
  if (!(await store.save())) store.quiz.group = previous
}

async function chooseScale(scale: GradingScaleType): Promise<void> {
  const previous = store.quiz.gradingScale
  store.quiz.gradingScale = scale
  if (!(await store.save())) store.quiz.gradingScale = previous
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

$switch-knob: 26px;

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

.quiz-settings__row,
.quiz-settings__link {
  padding: 18px 16px;
  border-radius: 22px;
  @include card-surface;
}

.quiz-settings__row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  gap: 6px 12px;
}

.quiz-settings__switch-label {
  font-size: 17px;
  font-weight: 700;
  line-height: 1.3;
  cursor: pointer;
}

// Прозрачная рамка расширяет цель касания до 44px; дорожку и бегунок рисует фон внутри неё
.quiz-settings__switch {
  width: 64px;
  height: 44px;
  margin: 0 -6px 0 0;
  border: 6px solid transparent;
  border-radius: 999px;
  background:
    radial-gradient(circle, var(--color-white) 0 calc($switch-knob / 2 - 1px), transparent calc($switch-knob / 2))
      left 3px center / #{$switch-knob} #{$switch-knob} no-repeat,
    var(--color-text-muted);
  background-clip: padding-box;
  cursor: pointer;
  appearance: none;
  transition:
    background-color 0.2s ease,
    background-position 0.2s ease;

  &:checked {
    background-color: var(--color-green-dark);
    background-position:
      right 3px center,
      0 0;
  }

  &:disabled {
    cursor: progress;
    opacity: 0.6;
  }
}

.quiz-settings__hint {
  grid-column: 1 / -1;
  margin: 0;
  color: var(--color-text-muted);
  font-size: 14px;
  line-height: 1.4;
}

.quiz-settings__scales {
  display: grid;
  grid-column: 1 / -1;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 8px;
  min-width: 0;
  margin: 10px 0 0;
  padding: 0;
  border: 0;
}

.quiz-settings__legend {
  margin-bottom: 8px;
  padding: 0;
  font-size: 15px;
  font-weight: 500;
}

.quiz-settings__scale {
  position: relative;
  display: flex;
}

// Радиокнопка остаётся в разметке ради клавиатуры и скринридера, а видна только подпись-сегмент
.quiz-settings__scale-input {
  position: absolute;
  inset: 0;
  margin: 0;
  opacity: 0;
  cursor: pointer;

  &:disabled {
    cursor: progress;
  }
}

.quiz-settings__scale-name {
  display: flex;
  flex: 1;
  align-items: center;
  justify-content: center;
  min-height: 48px;
  padding: 6px 4px;
  border: 2px solid rgb(var(--rgb-blue) / 0.3);
  border-radius: 14px;
  background: var(--color-white);
  color: var(--color-blue-dark);
  font-size: 15px;
  font-weight: 700;
  line-height: 1.2;
  text-align: center;
  overflow-wrap: anywhere;
  transition:
    background-color 0.2s ease,
    border-color 0.2s ease;

  @media (hover: hover) {
    .quiz-settings__scale-input:hover:not(:checked, :disabled) + & {
      border-color: var(--color-blue);
      background: rgb(var(--rgb-blue) / 0.06);
    }
  }

  .quiz-settings__scale-input:checked + & {
    border-color: var(--color-blue-dark);
    background: var(--color-blue-dark);
    color: var(--color-white);
  }

  .quiz-settings__scale-input:focus-visible + & {
    outline: 3px solid var(--focus-color);
    outline-offset: 2px;
  }

  .quiz-settings__scale-input:disabled + & {
    opacity: 0.6;
  }
}

.quiz-settings__thresholds {
  grid-column: 1 / -1;
  width: 100%;
  margin-top: 12px;
  border-collapse: collapse;
  font-size: 15px;

  th,
  td {
    padding: 7px 12px;
    border-top: 1px solid rgb(var(--rgb-blue) / 0.13);
  }

  th {
    width: 50%;
    font-family: var(--font-display);
    font-weight: 700;
    text-align: start;
  }

  td {
    color: var(--color-text-muted);
    text-align: end;
  }

  tr:nth-child(odd) {
    background: rgb(var(--rgb-blue) / 0.05);
  }
}

.quiz-settings__caption {
  padding-bottom: 6px;
  font-size: 15px;
  font-weight: 500;
  text-align: start;
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

.quiz-settings__link {
  display: flex;
  flex-direction: column;
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
  .quiz-settings__switch,
  .quiz-settings__scale-name,
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
