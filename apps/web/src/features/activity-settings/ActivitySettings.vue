<template>
  <div ref="root" class="activity-settings">
    <GroupSelect :model-value="settings.group" :disabled="disabled" @change="chooseGroup" />

    <div class="activity-settings__row">
      <label class="activity-settings__switch-label" for="quiz-show-answers">
        {{ t('teacher.quizEditor.settings.showAnswers') }}
      </label>
      <input
        id="quiz-show-answers"
        class="activity-settings__switch"
        type="checkbox"
        role="switch"
        :checked="settings.showAnswers"
        :disabled="disabled"
        aria-describedby="quiz-show-answers-hint"
        @change="setShowAnswers"
      >
      <p id="quiz-show-answers-hint" class="activity-settings__hint">{{ t(hintKeys.showAnswers) }}</p>
    </div>

    <div class="activity-settings__row">
      <label class="activity-settings__switch-label" for="quiz-grading">{{ t('teacher.quizEditor.settings.grading') }}</label>
      <input
        id="quiz-grading"
        class="activity-settings__switch"
        type="checkbox"
        role="switch"
        :checked="isGradingOpen"
        :disabled="disabled"
        aria-describedby="quiz-grading-hint"
        @change="toggleGrading"
      >
      <p id="quiz-grading-hint" class="activity-settings__hint">{{ t(hintKeys.grading) }}</p>

      <fieldset v-if="isGradingOpen" class="activity-settings__scales">
        <legend class="activity-settings__legend">{{ t('teacher.quizEditor.settings.scale') }}</legend>
        <label v-for="scale in GRADING_SCALE_TYPES" :key="scale" class="activity-settings__scale">
          <input
            class="activity-settings__scale-input"
            type="radio"
            name="quiz-scale"
            :value="scale"
            :checked="settings.gradingScale === scale"
            :disabled="disabled"
            @change="chooseScale(scale)"
          >
          <span class="activity-settings__scale-name">{{ t(`teacher.gradingScales.${scale}`) }}</span>
        </label>
      </fieldset>

      <table v-if="settings.gradingScale" class="activity-settings__thresholds">
        <caption class="activity-settings__caption">{{ t('teacher.quizEditor.settings.thresholds') }}</caption>
        <tbody>
          <!-- Оценка в строке, а не в столбце: десять столбцов 10-балльной шкалы не помещаются на телефоне -->
          <tr v-for="threshold in thresholds" :key="threshold.label">
            <th scope="row">{{ threshold.label }}</th>
            <td>{{ t('teacher.quizEditor.settings.from', { percent: threshold.minPercent }) }}</td>
          </tr>
        </tbody>
      </table>
    </div>

    <div class="activity-settings__row">
      <fieldset class="activity-settings__scales activity-settings__scales--timer" :aria-describedby="timerHintId">
        <legend class="activity-settings__legend activity-settings__legend--title">{{ t('teacher.quizEditor.settings.timer.title') }}</legend>
        <label v-for="mode in TIMER_MODES" :key="mode" class="activity-settings__scale">
          <input
            class="activity-settings__scale-input"
            type="radio"
            name="quiz-timer"
            :value="mode"
            :checked="settings.timer.mode === mode"
            :disabled="disabled"
            @change="chooseTimerMode(mode)"
          >
          <span class="activity-settings__scale-name">{{ t(`teacher.quizEditor.settings.timer.${mode}`) }}</span>
        </label>
      </fieldset>
      <p :id="timerHintId" class="activity-settings__hint">{{ t(`teacher.quizEditor.settings.timer.${settings.timer.mode}Hint`) }}</p>

      <div v-if="settings.timer.mode === 'limit'" class="activity-settings__minutes">
        <label class="activity-settings__minutes-label" for="quiz-time-limit">{{ t('teacher.quizEditor.settings.timer.minutes') }}</label>
        <input
          id="quiz-time-limit"
          :value="minutesText"
          class="activity-settings__minutes-input"
          type="number"
          inputmode="numeric"
          :min="MIN_TIME_LIMIT_MINUTES"
          :max="MAX_TIME_LIMIT_MINUTES"
          step="1"
          :disabled="disabled"
          :aria-invalid="minutesError !== ''"
          :aria-describedby="minutesError ? `${timerHintId} quiz-time-limit-error` : timerHintId"
          @input="minutesText = ($event.target as HTMLInputElement).value"
          @change="commitMinutes"
        >
        <p v-if="minutesError" id="quiz-time-limit-error" class="activity-settings__error" role="alert">{{ minutesError }}</p>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { GRADING_SCALES, GRADING_SCALE_TYPES, type GradingScaleType } from '@nataskium/shared/grading'
import {
  DEFAULT_TIME_LIMIT_SECONDS,
  MAX_TIME_LIMIT_SECONDS,
  MIN_TIME_LIMIT_SECONDS,
  TIMER_MODES,
  type ActivityKind,
  type QuizTimer,
} from '@nataskium/shared/schemas'
import { computed, nextTick, ref, useTemplateRef, watch } from 'vue'
import { useI18n } from '#imports'
import GroupSelect from './GroupSelect.vue'
import type { ActivitySettingsValue, SaveActivitySettings } from './types'

const SECONDS_PER_MINUTE = 60
const MIN_TIME_LIMIT_MINUTES = MIN_TIME_LIMIT_SECONDS / SECONDS_PER_MINUTE
const MAX_TIME_LIMIT_MINUTES = MAX_TIME_LIMIT_SECONDS / SECONDS_PER_MINUTE
const timerHintId = 'quiz-timer-hint'

type MinutesParse = { seconds: number } | { error: 'range' | 'integer' }

// Единственное место перевода минут формы в секунды схемы
function minutesToSeconds(text: string): MinutesParse {
  const minutes = text.trim() === '' ? Number.NaN : Number(text)
  if (!Number.isFinite(minutes)) return { error: 'range' }
  if (!Number.isInteger(minutes)) return { error: 'integer' }
  if (minutes < MIN_TIME_LIMIT_MINUTES || minutes > MAX_TIME_LIMIT_MINUTES) return { error: 'range' }
  return { seconds: minutes * SECONDS_PER_MINUTE }
}

function secondsToMinutes(seconds: number): string {
  return String(seconds / SECONDS_PER_MINUTE)
}

const props = withDefaults(
  defineProps<{
    settings: ActivitySettingsValue
    disabled: boolean
    save: SaveActivitySettings
    // Подсказки зависят от типа: у викторины проверка после каждого ответа, у сопоставления — одна в конце
    kind?: ActivityKind
  }>(),
  { kind: 'quiz' },
)

const { t } = useI18n()

const hintKeys = computed(() =>
  props.kind === 'matching'
    ? { showAnswers: 'teacher.matchingSettings.showAnswersHint', grading: 'teacher.matchingSettings.gradingHint' }
    : { showAnswers: 'teacher.quizEditor.settings.showAnswersHint', grading: 'teacher.quizEditor.settings.gradingHint' },
)
const thresholds = computed(() => (props.settings.gradingScale ? GRADING_SCALES[props.settings.gradingScale] : []))
// Включить оценку без шкалы нельзя: переключатель только открывает выбор, в задании шкала появляется с выбором
const isGradingOpen = ref(props.settings.gradingScale !== null)
const minutesText = ref('')
const minutesError = ref('')
const root = useTemplateRef<HTMLElement>('root')

// При неудаче props могут остаться прежними, и Vue не перерисует поле, которое учитель уже изменил в DOM:
// возвращаем поля к значениям из props сами, не полагаясь на родителя. Переключатель оценки ведёт isGradingOpen
async function restoreFields(): Promise<void> {
  await nextTick()
  const element = root.value
  if (!element) return
  const showAnswers = element.querySelector<HTMLInputElement>('#quiz-show-answers')
  if (showAnswers) showAnswers.checked = props.settings.showAnswers
  const group = element.querySelector<HTMLSelectElement>('#quiz-group')
  if (group) group.value = props.settings.group
  for (const radio of element.querySelectorAll<HTMLInputElement>('input[name="quiz-scale"]')) {
    radio.checked = radio.value === props.settings.gradingScale
  }
  for (const radio of element.querySelectorAll<HTMLInputElement>('input[name="quiz-timer"]')) {
    radio.checked = radio.value === props.settings.timer.mode
  }
  const { timer } = props.settings
  if (timer.mode === 'limit') minutesText.value = secondsToMinutes(timer.seconds)
}

async function saveOrRestore(patch: Partial<ActivitySettingsValue>): Promise<boolean> {
  if (await props.save(patch)) return true
  await restoreFields()
  return false
}

async function setShowAnswers(event: Event): Promise<void> {
  await saveOrRestore({ showAnswers: (event.target as HTMLInputElement).checked })
}

async function toggleGrading(event: Event): Promise<void> {
  isGradingOpen.value = (event.target as HTMLInputElement).checked
  if (isGradingOpen.value) return
  if (await saveOrRestore({ gradingScale: null })) return
  isGradingOpen.value = props.settings.gradingScale !== null
}

async function chooseGroup(slug: string): Promise<void> {
  await saveOrRestore({ group: slug })
}

async function chooseScale(scale: GradingScaleType): Promise<void> {
  await saveOrRestore({ gradingScale: scale })
}

watch(
  () => props.settings.timer,
  (timer) => {
    minutesError.value = ''
    if (timer.mode === 'limit') minutesText.value = secondsToMinutes(timer.seconds)
  },
  { immediate: true },
)

async function chooseTimerMode(mode: QuizTimer['mode']): Promise<void> {
  if (props.settings.timer.mode === mode) return
  await saveOrRestore({ timer: mode === 'limit' ? { mode, seconds: DEFAULT_TIME_LIMIT_SECONDS } : { mode } })
}

async function commitMinutes(): Promise<void> {
  const parsed = minutesToSeconds(minutesText.value)
  if ('error' in parsed) {
    minutesError.value =
      parsed.error === 'integer'
        ? t('teacher.quizEditor.settings.timer.minutesInteger')
        : t('teacher.quizEditor.settings.timer.minutesRange', { min: MIN_TIME_LIMIT_MINUTES, max: MAX_TIME_LIMIT_MINUTES })
    return
  }
  minutesError.value = ''
  if (props.settings.timer.mode === 'limit' && props.settings.timer.seconds === parsed.seconds) return
  await saveOrRestore({ timer: { mode: 'limit', seconds: parsed.seconds } })
}
</script>

<style scoped lang="scss">
@use '@/assets/styles/mixins' as *;

$switch-knob: 26px;

.activity-settings {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.activity-settings__row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  gap: 6px 12px;
  padding: 18px 16px;
  border-radius: 22px;
  @include card-surface;
}

.activity-settings__switch-label {
  font-size: 17px;
  font-weight: 700;
  line-height: 1.3;
  cursor: pointer;
}

// Прозрачная рамка расширяет цель касания до 44px; дорожку и бегунок рисует фон внутри неё
.activity-settings__switch {
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

.activity-settings__hint {
  grid-column: 1 / -1;
  margin: 0;
  color: var(--color-text-muted);
  font-size: 14px;
  line-height: 1.4;
}

.activity-settings__scales {
  display: grid;
  grid-column: 1 / -1;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 8px;
  min-width: 0;
  margin: 10px 0 0;
  padding: 0;
  border: 0;
}

.activity-settings__legend {
  margin-bottom: 8px;
  padding: 0;
  font-size: 15px;
  font-weight: 500;
}

.activity-settings__scale {
  position: relative;
  display: flex;
}

// Радиокнопка остаётся в разметке ради клавиатуры и скринридера, а видна только подпись-сегмент
.activity-settings__scale-input {
  position: absolute;
  inset: 0;
  margin: 0;
  opacity: 0;
  cursor: pointer;

  &:disabled {
    cursor: progress;
  }
}

.activity-settings__scale-name {
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
  // break-word, а не anywhere: слово переносится целиком, рвётся только если не влезает в строку вовсе
  overflow-wrap: break-word;
  transition:
    background-color 0.2s ease,
    border-color 0.2s ease;

  @media (hover: hover) {
    .activity-settings__scale-input:hover:not(:checked, :disabled) + & {
      border-color: var(--color-blue);
      background: rgb(var(--rgb-blue) / 0.06);
    }
  }

  .activity-settings__scale-input:checked + & {
    border-color: var(--color-blue-dark);
    background: var(--color-blue-dark);
    color: var(--color-white);
  }

  .activity-settings__scale-input:focus-visible + & {
    outline: 3px solid var(--focus-color);
    outline-offset: 2px;
  }

  .activity-settings__scale-input:disabled + & {
    opacity: 0.6;
  }
}

// Подписи режимов длиннее названий шкал: плитки растут по слову и при нехватке места уходят на новую строку
.activity-settings__scales--timer {
  display: flex;
  flex-wrap: wrap;
  margin-top: 0;

  .activity-settings__scale {
    flex: 1 1 auto;
  }
}

.activity-settings__legend--title {
  margin-bottom: 10px;
  font-size: 17px;
  font-weight: 700;
  line-height: 1.3;
}

.activity-settings__minutes {
  display: flex;
  grid-column: 1 / -1;
  flex-direction: column;
  align-items: flex-start;
  gap: 6px;
  margin-top: 8px;
}

.activity-settings__minutes-label {
  font-size: 15px;
  font-weight: 500;
}

.activity-settings__minutes-input {
  width: 120px;
  min-height: 48px;
  padding: 10px 14px;
  border: 2px solid rgb(var(--rgb-blue) / 0.45);
  border-radius: 14px;
  background: var(--color-white);
  color: var(--color-text);
  font: inherit;
  font-size: 18px;
  font-weight: 700;

  &:focus-visible {
    outline: 3px solid var(--focus-color);
    outline-offset: 2px;
  }

  &[aria-invalid='true'] {
    border-color: var(--color-orange-dark);
  }

  &:disabled {
    opacity: 0.6;
  }
}

.activity-settings__thresholds {
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

.activity-settings__caption {
  padding-bottom: 6px;
  font-size: 15px;
  font-weight: 500;
  text-align: start;
}

// Текст ошибки тёмный, знак оранжевый: оранжево-тёмный текст на белом дал бы 3.6:1
.activity-settings__error {
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

@media (prefers-reduced-motion: reduce) {
  .activity-settings__switch,
  .activity-settings__scale-name {
    transition: none;
  }
}
</style>
