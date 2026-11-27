<template>
  <div class="matching-editor">
    <p v-if="store.loadStatus === 'loading'" class="matching-editor__loading" role="status">{{ t('teacher.matchingEditor.loading') }}</p>

    <div v-else-if="store.loadStatus === 'notFound'" class="matching-editor__problem">
      <p role="alert">{{ t('teacher.matchingEditor.notFound') }}</p>
      <NuxtLink class="matching-editor__soft-button" :to="localePath(TEACHER_PATHS.activities)">
        {{ t('teacher.matchingEditor.toActivities') }}
      </NuxtLink>
    </div>

    <div v-else-if="store.loadStatus === 'error'" class="matching-editor__problem">
      <p role="alert">{{ t('teacher.matchingEditor.loadError') }}</p>
      <button class="matching-editor__soft-button" type="button" @click="start">{{ t('teacher.matchingEditor.retry') }}</button>
    </div>

    <template v-else-if="store.view === 'settings'">
      <button class="matching-editor__back" type="button" @click="store.view = 'pairs'">
        {{ t('teacher.matchingEditor.backToPairs') }}
      </button>
      <MatchingSettings />
    </template>

    <form v-else ref="form" class="matching-editor__form" novalidate @submit.prevent="save()">
      <div role="status">
        <div v-if="isSavedNoticeShown" ref="savedNotice" class="matching-editor__saved">
          <p class="matching-editor__saved-title">{{ t('teacher.matchingEditor.saved') }}</p>
          <p class="matching-editor__saved-hint">{{ t('teacher.matchingEditor.savedHint') }}</p>
          <div class="matching-editor__saved-actions">
            <button class="matching-editor__saved-copy" type="button" @click="copyLink">
              {{ t('teacher.quizEditor.settings.copy') }}
            </button>
            <NuxtLink class="matching-editor__saved-try" :to="previewPath">
              {{ t('teacher.quizEditor.tryActivity') }}
            </NuxtLink>
            <NuxtLink class="matching-editor__saved-link" :to="localePath(TEACHER_PATHS.activities)">
              {{ t('teacher.matchingEditor.toActivities') }}
            </NuxtLink>
          </div>
          <p class="matching-editor__saved-copy-status">{{ copyMessage }}</p>
        </div>
      </div>

      <label class="matching-editor__label" for="matching-title">{{ t('teacher.matchingEditor.titleLabel') }}</label>
      <input
        id="matching-title"
        v-model="store.matching.title"
        class="matching-editor__title-input"
        type="text"
        :maxlength="QUIZ_TITLE_MAX_LENGTH"
        :placeholder="t('teacher.matchingEditor.titlePlaceholder')"
        :aria-invalid="titleError !== undefined"
        :aria-describedby="titleError ? 'matching-title-error' : undefined"
      >
      <p v-if="titleError" id="matching-title-error" class="matching-editor__field-error" role="alert">{{ titleError }}</p>

      <GroupSelect
        class="matching-editor__group"
        :model-value="store.matching.group"
        :disabled="isSaving"
        :invalid="groupError !== undefined"
        @change="store.matching.group = $event"
      />
      <p v-if="groupError" id="quiz-group-error" class="matching-editor__field-error" role="alert">{{ groupError }}</p>

      <div class="matching-editor__pairs-head">
        <h2 id="matching-pairs-heading" class="matching-editor__pairs-title">{{ t('teacher.matchingEditor.pairsHeading') }}</h2>
        <p class="matching-editor__pairs-count">
          {{ t('teacher.matchingEditor.pairsCount', { count: store.matching.pairs.length, max: MAX_MATCHING_PAIRS }) }}
        </p>
      </div>
      <p class="matching-editor__hint">{{ t('teacher.matchingEditor.pairsHint') }}</p>

      <ol class="matching-editor__pairs" aria-labelledby="matching-pairs-heading">
        <PairCard v-for="(_, index) in store.matching.pairs" :key="pairKey(index)" :index="index" />
      </ol>
      <p v-if="pairsError" class="matching-editor__field-error" role="alert">{{ pairsError }}</p>
      <p v-if="!store.canRemovePair" id="matching-min-pairs" class="matching-editor__limit">
        {{ t('teacher.matchingEditor.minReached', { min: MIN_MATCHING_PAIRS }) }}
      </p>

      <button
        class="matching-editor__add"
        type="button"
        :disabled="!store.canAddPair"
        :aria-describedby="store.canAddPair ? undefined : 'matching-max-pairs'"
        @click="addPair"
      >
        {{ t('teacher.matchingEditor.addPair') }}
      </button>
      <p v-if="!store.canAddPair" id="matching-max-pairs" class="matching-editor__limit">
        {{ t('teacher.matchingEditor.maxReached', { max: MAX_MATCHING_PAIRS }) }}
      </p>

      <p v-if="errorMessage" class="matching-editor__error-text" role="alert">{{ errorMessage }}</p>

      <p v-if="store.isDirty && !isSaving" class="matching-editor__unsaved">{{ t('teacher.matchingEditor.unsaved') }}</p>

      <div class="matching-editor__actions">
        <button class="matching-editor__save" type="submit" :disabled="isSaving">
          {{ isSaving ? t('teacher.matchingEditor.saving') : t('teacher.matchingEditor.save') }}
        </button>
        <button class="matching-editor__settings" type="button" :disabled="isSaving" @click="openSettings">
          {{ t('teacher.matchingEditor.settingsButton') }}
        </button>
      </div>
    </form>

    <AppConfirmDialog
      v-model:open="isLeaveOpen"
      :title="t('teacher.matchingEditor.leaveDialog.title')"
      :text="t('teacher.matchingEditor.leaveDialog.text')"
      :confirm-label="t('teacher.matchingEditor.leaveDialog.confirm')"
      :cancel-label="t('teacher.matchingEditor.leaveDialog.cancel')"
      @confirm="answerLeave(true)"
    />
  </div>
</template>

<script setup lang="ts">
import { MAX_ACTIVITIES_PER_TEACHER, MAX_MATCHING_PAIRS, MIN_MATCHING_PAIRS, QUIZ_TITLE_MAX_LENGTH } from '@nataskium/shared/schemas'
import { computed, nextTick, onBeforeUnmount, onMounted, ref, toRaw, useTemplateRef, watch } from 'vue'
import { NuxtLink } from '#components'
import { navigateTo, onBeforeRouteLeave, useI18n, useLocalePath } from '#imports'
import { playUrl } from '@/entities/quiz'
import { GroupSelect } from '@/features/activity-settings'
import { AppConfirmDialog, TEACHER_PATHS } from '@/shared'
import MatchingSettings from './components/MatchingSettings.vue'
import PairCard from './components/PairCard.vue'
import { issueText } from './matchingErrors'
import { useMatchingEditorStore } from './store'

const props = defineProps<{
  // Нет id — новое задание
  matchingId?: string
}>()

const { t } = useI18n()
const localePath = useLocalePath()
const store = useMatchingEditorStore()
const form = useTemplateRef<HTMLFormElement>('form')
const savedNotice = useTemplateRef<HTMLElement>('savedNotice')

const isSaving = computed(() => store.saveStatus === 'saving')
const titleError = computed(() => fieldError('title'))
const groupError = computed(() => fieldError('group'))
const pairsError = computed(() => fieldError('pairs'))
// После правки задание снова «не сохранено»: плашка пропадает, пока учитель не нажмёт «Сохранить»
const isSavedNoticeShown = computed(() => store.saveStatus === 'saved' && !store.isDirty)
const copyMessage = ref('')
const isLeaveOpen = ref(false)

const errorMessage = computed(() => {
  if (store.saveStatus === 'limitReached') return t('teacher.matchingEditor.limitReached', { max: MAX_ACTIVITIES_PER_TEACHER })
  if (store.saveStatus === 'failed') return t('teacher.matchingEditor.saveFailed')
  if (store.saveStatus !== 'invalid') return ''
  if (store.invalidPairs.length === 0) return t('teacher.matchingEditor.invalid')
  return t('teacher.matchingEditor.invalidPairs', { pairs: store.invalidPairs.join(', ') })
})

watch(
  isSavedNoticeShown,
  async (isShown) => {
    copyMessage.value = ''
    if (!isShown) return
    await nextTick()
    savedNotice.value?.scrollIntoView({ block: 'center' })
  },
  { immediate: true },
)

function fieldError(key: string): string | undefined {
  const error = store.errorOf(key)
  return error === undefined ? undefined : issueText(key, error, t)
}

// Ключ карточки — по объекту пары, а не по индексу: после удаления пары поле с фокусом не достаётся соседке
const pairKeys = new WeakMap<object, number>()
let nextPairKey = 0

function pairKey(index: number): number {
  const pair = store.matching.pairs[index]
  if (pair === undefined) return -1
  const raw = toRaw(pair)
  const known = pairKeys.get(raw)
  if (known !== undefined) return known
  pairKeys.set(raw, nextPairKey)
  return nextPairKey++
}

// Новая пара сразу получает фокус: видно, куда она добавилась
async function addPair(): Promise<void> {
  store.addPair()
  await nextTick()
  form.value?.querySelector<HTMLInputElement>(`#pair-${store.matching.pairs.length - 1}-term`)?.focus()
}

async function focusFirstError(): Promise<void> {
  await nextTick()
  form.value?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus()
}

// После создания страница меняется на /teacher/matching/<id>, и store уже хранит это задание: заново его не грузим.
// Старая страница размонтируется, когда новая уже могла стартовать: решение о сбросе держим здесь
let isHandingOver = false

async function start(): Promise<void> {
  if (props.matchingId === undefined) {
    if (store.id !== null) store.reset()
    return
  }
  if (store.handoverId === props.matchingId) {
    store.handoverId = null
    return
  }
  store.reset()
  await store.load(props.matchingId)
}

// beforeNavigate — действие до перехода на адрес созданного задания: после него старая страница уже не живёт
async function save(beforeNavigate?: () => void): Promise<boolean> {
  const isNew = store.id === null
  const isSaved = await store.save()
  if (!isSaved) {
    if (store.saveStatus === 'invalid') await focusFirstError()
    return false
  }
  beforeNavigate?.()
  if (isNew && store.id !== null) {
    isHandingOver = true
    store.handoverId = store.id
    try {
      await navigateTo(localePath(`${TEACHER_PATHS.matchingEdit}/${store.id}`), { replace: true })
    } finally {
      // Новая страница к этому времени уже забрала передачу; не удалась навигация — передачи не было
      store.handoverId = null
      isHandingOver = false
    }
  }
  return true
}

async function openSettings(): Promise<void> {
  await save(() => {
    store.view = 'settings'
  })
}

// «Пройти задание»: учитель проходит своё задание так, как его увидят ученики (результаты не сохраняются)
const previewPath = computed(() => (store.shareToken === null ? '' : localePath(`/play/${encodeURIComponent(store.shareToken)}`)))

async function copyLink(): Promise<void> {
  if (store.shareToken === null) return
  try {
    await navigator.clipboard.writeText(playUrl(store.shareToken))
    copyMessage.value = t('teacher.activities.linkCopied')
  } catch {
    copyMessage.value = t('teacher.activities.copyFailed')
  }
}

function warnBeforeUnload(event: BeforeUnloadEvent): void {
  if (store.isDirty) event.preventDefault()
}

// Переход ждёт выбора в диалоге: «Уйти» разрешает его, любое закрытие диалога — отменяет
let resolveLeave: ((canLeave: boolean) => void) | null = null

function answerLeave(canLeave: boolean): void {
  resolveLeave?.(canLeave)
  resolveLeave = null
}

watch(isLeaveOpen, (isOpen) => {
  if (!isOpen) answerLeave(false)
})

onBeforeRouteLeave(() => {
  if (!store.isDirty) return true
  isLeaveOpen.value = true
  return new Promise<boolean>((resolve) => {
    resolveLeave = resolve
  })
})

onMounted(() => {
  window.addEventListener('beforeunload', warnBeforeUnload)
  void start()
})

onBeforeUnmount(() => {
  window.removeEventListener('beforeunload', warnBeforeUnload)
  // Состояние не переносится между заходами; исключение — переход после создания
  if (!isHandingOver) store.reset()
})
</script>

<style scoped lang="scss">
@use '@/assets/styles/mixins' as *;

%message {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  margin: 0;
  font-size: 16px;
  font-weight: 500;
  line-height: 1.4;

  &::before {
    display: grid;
    flex: none;
    place-items: center;
    width: 22px;
    height: 22px;
    margin-top: 1px;
    border-radius: 50%;
    color: var(--color-white);
    font-size: 13px;
    font-weight: 700;
    line-height: 1;
  }
}

// Текст ошибки тёмный, знак оранжевый: оранжево-тёмный текст на белом дал бы 3.6:1
%error {
  @extend %message;

  &::before {
    content: '!';
    content: '!' / '';
    background: var(--color-orange-dark);
  }
}

%soft-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 48px;
  padding: 0 18px;
  border: 0;
  border-radius: 14px;
  background: rgb(var(--rgb-blue) / 0.1);
  color: var(--color-blue-dark);
  font: inherit;
  font-size: 17px;
  font-weight: 700;
  line-height: 1.2;
  text-decoration: none;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
  transition: background-color 0.2s ease;

  @media (hover: hover) {
    &:hover {
      background: rgb(var(--rgb-blue) / 0.16);
    }
  }

  &:active {
    background: rgb(var(--rgb-blue) / 0.24);
  }
}

%pill-button {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  min-height: 56px;
  padding: 8px 16px;
  border: 0;
  border-radius: 999px;
  font: inherit;
  font-size: 18px;
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

  &:active:not(:disabled) {
    transform: scale(0.98);
  }

  &:disabled {
    cursor: progress;
    opacity: 0.7;
  }
}

.matching-editor {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.matching-editor__loading {
  margin: 0;
  color: var(--color-text-muted);
  font-size: 17px;
}

.matching-editor__problem {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 12px;
  padding: 20px;
  border-radius: 22px;
  @include card-surface;

  p {
    margin: 0;
    font-size: 17px;
    font-weight: 500;
  }
}

.matching-editor__soft-button {
  @extend %soft-button;
}

.matching-editor__back {
  @extend %soft-button;

  align-self: flex-start;
  margin-left: -8px;
  background: none;
}

.matching-editor__form {
  display: flex;
  flex-direction: column;
}

.matching-editor__label {
  font-size: 17px;
  font-weight: 600;
  line-height: 1.3;
}

.matching-editor__title-input {
  width: 100%;
  min-height: 60px;
  margin-top: 8px;
  padding: 12px 16px;
  border: 2px solid var(--color-text-muted);
  border-radius: 18px;
  background: var(--color-white);
  color: var(--color-text);
  font: inherit;
  font-size: 20px;
  font-weight: 700;
  line-height: 1.25;
  transition: border-color 0.2s ease;

  &::placeholder {
    color: var(--color-text-muted);
    font-weight: 400;
  }

  &:focus {
    border-color: var(--color-blue-dark);
  }

  &[aria-invalid='true'] {
    border-color: var(--color-orange-dark);
  }
}

.matching-editor__group {
  margin-top: 16px;
}

.matching-editor__field-error {
  @extend %error;

  margin-top: 8px;
}

// Линия и заголовок отделяют пары от названия: список — часть задания, а не отдельные задания
.matching-editor__pairs-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
  margin-top: 28px;
  padding-top: 20px;
  border-top: 2px solid rgb(var(--rgb-blue) / 0.13);
}

.matching-editor__pairs-title {
  margin: 0;
  font-size: 24px;
  font-weight: 700;
  line-height: 1.3;
}

.matching-editor__pairs-count {
  margin: 0;
  color: var(--color-text-muted);
  font-size: 17px;
  font-weight: 500;
  white-space: nowrap;
}

.matching-editor__hint {
  margin: 8px 0 0;
  color: var(--color-text-muted);
  font-size: 16px;
  line-height: 1.4;
}

.matching-editor__pairs {
  display: flex;
  flex-direction: column;
  gap: 16px;
  margin: 14px 0 0;
  padding: 0;
}

.matching-editor__limit {
  margin: 10px 0 0;
  color: var(--color-text-muted);
  font-size: 16px;
  line-height: 1.4;
  text-align: center;
}

.matching-editor__add {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 64px;
  margin-top: 16px;
  padding: 8px 16px;
  border: 3px dashed rgb(var(--rgb-blue) / 0.6);
  border-radius: 22px;
  background: var(--color-white);
  color: var(--color-blue-dark);
  font: inherit;
  font-size: 18px;
  font-weight: 700;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
  transition: background-color 0.2s ease;

  @media (hover: hover) {
    &:hover:not(:disabled) {
      background: rgb(var(--rgb-blue) / 0.06);
    }
  }

  &:active:not(:disabled) {
    background: rgb(var(--rgb-blue) / 0.14);
  }

  &:disabled {
    cursor: not-allowed;
    opacity: 0.45;
  }
}

.matching-editor__saved {
  margin-bottom: 20px;
  padding: 18px 16px;
  border-radius: 22px;
  background: rgb(var(--rgb-green) / 0.14);
}

.matching-editor__saved-title {
  @extend %message;

  font-size: 19px;
  font-weight: 700;

  &::before {
    content: '✓';
    content: '✓' / '';
    background: var(--color-green-dark);
  }
}

.matching-editor__saved-hint {
  margin: 6px 0 0;
  font-size: 16px;
  line-height: 1.4;
}

.matching-editor__saved-actions {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin-top: 14px;
}

.matching-editor__saved-copy {
  @extend %pill-button;

  background: var(--color-white);
  color: var(--color-blue-dark);
}

.matching-editor__saved-link {
  @extend %pill-button;

  background: var(--color-blue-dark);
  color: var(--color-white);
}

// Пройти своё задание — зелёная, как «Начать» у ученика
.matching-editor__saved-try {
  @extend %pill-button;

  background: var(--color-green);
  color: var(--color-text);
  text-decoration: none;
}

.matching-editor__saved-copy-status {
  margin: 8px 0 0;
  font-size: 16px;
  font-weight: 500;

  &:empty {
    display: none;
  }
}

.matching-editor__error-text {
  @extend %error;

  margin-top: 16px;
  padding: 12px 14px;
  border-radius: 16px;
  background: rgb(var(--rgb-orange) / 0.14);
}

.matching-editor__unsaved {
  margin: 16px 0 0;
  color: var(--color-text-muted);
  font-size: 16px;
  font-weight: 500;
}

.matching-editor__actions {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin-top: 20px;
}

.matching-editor__settings {
  @extend %pill-button;

  background: var(--color-blue-dark);
  box-shadow: 0 10px 24px rgb(var(--rgb-blue) / 0.35);
  color: var(--color-white);

  @media (hover: hover) {
    &:hover:not(:disabled) {
      box-shadow: 0 14px 28px rgb(var(--rgb-blue) / 0.45);
    }
  }
}

.matching-editor__save {
  @extend %pill-button;

  background: rgb(var(--rgb-blue) / 0.1);
  color: var(--color-blue-dark);

  @media (hover: hover) {
    &:hover:not(:disabled) {
      background: rgb(var(--rgb-blue) / 0.16);
    }
  }

  &:active:not(:disabled) {
    background: rgb(var(--rgb-blue) / 0.24);
  }
}

@media (prefers-reduced-motion: reduce) {
  .matching-editor__soft-button,
  .matching-editor__back,
  .matching-editor__title-input,
  .matching-editor__add,
  .matching-editor__settings,
  .matching-editor__save,
  .matching-editor__saved-copy,
  .matching-editor__saved-link {
    transition: none;
  }

  .matching-editor__settings:active,
  .matching-editor__save:active,
  .matching-editor__saved-copy:active,
  .matching-editor__saved-link:active {
    transform: none;
  }
}
</style>
