<template>
  <div class="true-false-editor">
    <p v-if="store.loadStatus === 'loading'" class="true-false-editor__loading" role="status">{{ t('teacher.trueFalseEditor.loading') }}</p>

    <div v-else-if="store.loadStatus === 'notFound'" class="true-false-editor__problem">
      <p role="alert">{{ t('teacher.trueFalseEditor.notFound') }}</p>
      <NuxtLink class="true-false-editor__soft-button" :to="localePath(TEACHER_PATHS.activities)">
        {{ t('teacher.trueFalseEditor.toActivities') }}
      </NuxtLink>
    </div>

    <div v-else-if="store.loadStatus === 'error'" class="true-false-editor__problem">
      <p role="alert">{{ t('teacher.trueFalseEditor.loadError') }}</p>
      <button class="true-false-editor__soft-button" type="button" @click="start">{{ t('teacher.trueFalseEditor.retry') }}</button>
    </div>

    <template v-else-if="store.view === 'settings'">
      <button class="true-false-editor__back" type="button" @click="store.view = 'items'">
        {{ t('teacher.trueFalseEditor.backToItems') }}
      </button>
      <TrueFalseSettings />
    </template>

    <form v-else ref="form" class="true-false-editor__form" novalidate @submit.prevent="save()">
      <div role="status">
        <div v-if="isSavedNoticeShown" ref="savedNotice" class="true-false-editor__saved">
          <p class="true-false-editor__saved-title">{{ t('teacher.trueFalseEditor.saved') }}</p>
          <p class="true-false-editor__saved-hint">{{ t('teacher.trueFalseEditor.savedHint') }}</p>
          <div class="true-false-editor__saved-actions">
            <button class="true-false-editor__saved-copy" type="button" @click="copyLink">
              {{ t('teacher.quizEditor.settings.copy') }}
            </button>
            <NuxtLink class="true-false-editor__saved-link" :to="localePath(TEACHER_PATHS.activities)">
              {{ t('teacher.trueFalseEditor.toActivities') }}
            </NuxtLink>
          </div>
          <p class="true-false-editor__saved-copy-status">{{ copyMessage }}</p>
        </div>
      </div>

      <label class="true-false-editor__label" for="true-false-title">{{ t('teacher.trueFalseEditor.titleLabel') }}</label>
      <input
        id="true-false-title"
        v-model="store.trueFalse.title"
        class="true-false-editor__title-input"
        type="text"
        :maxlength="QUIZ_TITLE_MAX_LENGTH"
        :placeholder="t('teacher.trueFalseEditor.titlePlaceholder')"
        :aria-invalid="titleError !== undefined"
        :aria-describedby="titleError ? 'true-false-title-error' : undefined"
      >
      <p v-if="titleError" id="true-false-title-error" class="true-false-editor__field-error" role="alert">{{ titleError }}</p>

      <GroupSelect
        class="true-false-editor__group"
        :model-value="store.trueFalse.group"
        :disabled="isSaving"
        :invalid="groupError !== undefined"
        @change="store.trueFalse.group = $event"
      />
      <p v-if="groupError" id="quiz-group-error" class="true-false-editor__field-error" role="alert">{{ groupError }}</p>

      <div class="true-false-editor__items-head">
        <h2 id="true-false-items-heading" class="true-false-editor__items-title">{{ t('teacher.trueFalseEditor.itemsHeading') }}</h2>
        <p class="true-false-editor__items-count">
          {{ t('teacher.trueFalseEditor.itemsCount', { count: store.items.length, max: MAX_TRUE_FALSE_ITEMS }) }}
        </p>
      </div>
      <p class="true-false-editor__hint">{{ t('teacher.trueFalseEditor.itemsHint') }}</p>

      <ol class="true-false-editor__items" aria-labelledby="true-false-items-heading">
        <StatementCard v-for="(_, index) in store.items" :key="itemKey(index)" :index="index" />
      </ol>
      <p v-if="itemsError" class="true-false-editor__field-error" role="alert">{{ itemsError }}</p>
      <p v-if="!store.canRemoveItem" id="true-false-min-items" class="true-false-editor__limit">
        {{ t('teacher.trueFalseEditor.minReached', { min: MIN_TRUE_FALSE_ITEMS }) }}
      </p>

      <button v-if="store.canAddItem" class="true-false-editor__add" type="button" @click="addItem">
        {{ t('teacher.trueFalseEditor.addItem') }}
      </button>
      <p v-else id="true-false-max-items" class="true-false-editor__limit">
        {{ t('teacher.trueFalseEditor.maxReached', { max: MAX_TRUE_FALSE_ITEMS }) }}
      </p>

      <p v-if="errorMessage" class="true-false-editor__error-text" role="alert">{{ errorMessage }}</p>

      <p v-if="store.isDirty && !isSaving" class="true-false-editor__unsaved">{{ t('teacher.trueFalseEditor.unsaved') }}</p>

      <div class="true-false-editor__actions">
        <button class="true-false-editor__save" type="submit" :disabled="isSaving">
          {{ isSaving ? t('teacher.trueFalseEditor.saving') : t('teacher.trueFalseEditor.save') }}
        </button>
        <button class="true-false-editor__settings" type="button" :disabled="isSaving" @click="openSettings">
          {{ t('teacher.trueFalseEditor.settingsButton') }}
        </button>
      </div>
    </form>

    <AppConfirmDialog
      v-model:open="isLeaveOpen"
      :title="t('teacher.trueFalseEditor.leaveDialog.title')"
      :text="t('teacher.trueFalseEditor.leaveDialog.text')"
      :confirm-label="t('teacher.trueFalseEditor.leaveDialog.confirm')"
      :cancel-label="t('teacher.trueFalseEditor.leaveDialog.cancel')"
      @confirm="answerLeave(true)"
    />
  </div>
</template>

<script setup lang="ts">
import { MAX_ACTIVITIES_PER_TEACHER, MAX_TRUE_FALSE_ITEMS, MIN_TRUE_FALSE_ITEMS, QUIZ_TITLE_MAX_LENGTH } from '@nataskium/shared/schemas'
import { computed, nextTick, onBeforeUnmount, onMounted, ref, toRaw, useTemplateRef, watch } from 'vue'
import { NuxtLink } from '#components'
import { navigateTo, onBeforeRouteLeave, useI18n, useLocalePath } from '#imports'
import { playUrl } from '@/entities/quiz'
import { GroupSelect } from '@/features/activity-settings'
import { AppConfirmDialog, TEACHER_PATHS } from '@/shared'
import TrueFalseSettings from './components/TrueFalseSettings.vue'
import StatementCard from './components/StatementCard.vue'
import { useTrueFalseEditorStore } from './store'
import { issueText } from './trueFalseErrors'

const props = defineProps<{
  // Нет id — новое задание
  trueFalseId?: string
}>()

const { t } = useI18n()
const localePath = useLocalePath()
const store = useTrueFalseEditorStore()
const form = useTemplateRef<HTMLFormElement>('form')
const savedNotice = useTemplateRef<HTMLElement>('savedNotice')

const isSaving = computed(() => store.saveStatus === 'saving')
const titleError = computed(() => fieldError('title'))
const groupError = computed(() => fieldError('group'))
const itemsError = computed(() => fieldError('items'))
// После правки задание снова «не сохранено»: плашка пропадает, пока учитель не нажмёт «Сохранить»
const isSavedNoticeShown = computed(() => store.saveStatus === 'saved' && !store.isDirty)
const copyMessage = ref('')
const isLeaveOpen = ref(false)

const errorMessage = computed(() => {
  if (store.saveStatus === 'limitReached') return t('teacher.trueFalseEditor.limitReached', { max: MAX_ACTIVITIES_PER_TEACHER })
  if (store.saveStatus === 'failed') return t('teacher.trueFalseEditor.saveFailed')
  if (store.saveStatus !== 'invalid') return ''
  if (store.invalidItems.length === 0) return t('teacher.trueFalseEditor.invalid')
  return t('teacher.trueFalseEditor.invalidItems', { items: store.invalidItems.join(', ') })
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

// Ключ карточки — по объекту утверждения, а не по индексу: после удаления утверждения поле с фокусом не достаётся соседке
const itemKeys = new WeakMap<object, number>()
let nextItemKey = 0

function itemKey(index: number): number {
  const item = store.items[index]
  if (item === undefined) return -1
  const raw = toRaw(item)
  const known = itemKeys.get(raw)
  if (known !== undefined) return known
  itemKeys.set(raw, nextItemKey)
  return nextItemKey++
}

// Новое утверждение сразу получает фокус: видно, куда она добавилась
async function addItem(): Promise<void> {
  store.addItem()
  await nextTick()
  form.value?.querySelector<HTMLTextAreaElement>(`#item-${store.items.length - 1}-statement`)?.focus()
}

async function focusFirstError(): Promise<void> {
  await nextTick()
  form.value?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus()
}

// После создания страница меняется на /teacher/true-false/<id>, и store уже хранит это задание: заново его не грузим.
// Старая страница размонтируется, когда новая уже могла стартовать: решение о сбросе держим здесь
let isHandingOver = false

async function start(): Promise<void> {
  if (props.trueFalseId === undefined) {
    if (store.id !== null) store.reset()
    return
  }
  if (store.handoverId === props.trueFalseId) {
    store.handoverId = null
    return
  }
  store.reset()
  await store.load(props.trueFalseId)
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
      await navigateTo(localePath(`${TEACHER_PATHS.trueFalseEdit}/${store.id}`), { replace: true })
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

.true-false-editor {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.true-false-editor__loading {
  margin: 0;
  color: var(--color-text-muted);
  font-size: 17px;
}

.true-false-editor__problem {
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

.true-false-editor__soft-button {
  @extend %soft-button;
}

.true-false-editor__back {
  @extend %soft-button;

  align-self: flex-start;
  margin-left: -8px;
  background: none;
}

.true-false-editor__form {
  display: flex;
  flex-direction: column;
}

.true-false-editor__label {
  font-size: 17px;
  font-weight: 600;
  line-height: 1.3;
}

.true-false-editor__title-input {
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

.true-false-editor__group {
  margin-top: 16px;
}

.true-false-editor__field-error {
  @extend %error;

  margin-top: 8px;
}

// Линия и заголовок отделяют утверждения от названия: список — часть задания, а не отдельные задания
.true-false-editor__items-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
  margin-top: 28px;
  padding-top: 20px;
  border-top: 2px solid rgb(var(--rgb-blue) / 0.13);
}

.true-false-editor__items-title {
  margin: 0;
  font-size: 24px;
  font-weight: 700;
  line-height: 1.3;
}

.true-false-editor__items-count {
  margin: 0;
  color: var(--color-text-muted);
  font-size: 17px;
  font-weight: 500;
  white-space: nowrap;
}

.true-false-editor__hint {
  margin: 8px 0 0;
  color: var(--color-text-muted);
  font-size: 16px;
  line-height: 1.4;
}

.true-false-editor__items {
  display: flex;
  flex-direction: column;
  gap: 16px;
  margin: 14px 0 0;
  padding: 0;
}

.true-false-editor__limit {
  margin: 10px 0 0;
  color: var(--color-text-muted);
  font-size: 16px;
  line-height: 1.4;
  text-align: center;
}

.true-false-editor__add {
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

.true-false-editor__saved {
  margin-bottom: 20px;
  padding: 18px 16px;
  border-radius: 22px;
  background: rgb(var(--rgb-green) / 0.14);
}

.true-false-editor__saved-title {
  @extend %message;

  font-size: 19px;
  font-weight: 700;

  &::before {
    content: '✓';
    content: '✓' / '';
    background: var(--color-green-dark);
  }
}

.true-false-editor__saved-hint {
  margin: 6px 0 0;
  font-size: 16px;
  line-height: 1.4;
}

.true-false-editor__saved-actions {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin-top: 14px;
}

.true-false-editor__saved-copy {
  @extend %pill-button;

  background: var(--color-white);
  color: var(--color-blue-dark);
}

.true-false-editor__saved-link {
  @extend %pill-button;

  background: var(--color-blue-dark);
  color: var(--color-white);
}

.true-false-editor__saved-copy-status {
  margin: 8px 0 0;
  font-size: 16px;
  font-weight: 500;

  &:empty {
    display: none;
  }
}

.true-false-editor__error-text {
  @extend %error;

  margin-top: 16px;
  padding: 12px 14px;
  border-radius: 16px;
  background: rgb(var(--rgb-orange) / 0.14);
}

.true-false-editor__unsaved {
  margin: 16px 0 0;
  color: var(--color-text-muted);
  font-size: 16px;
  font-weight: 500;
}

.true-false-editor__actions {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin-top: 20px;
}

.true-false-editor__settings {
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

.true-false-editor__save {
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
  .true-false-editor__soft-button,
  .true-false-editor__back,
  .true-false-editor__title-input,
  .true-false-editor__add,
  .true-false-editor__settings,
  .true-false-editor__save,
  .true-false-editor__saved-copy,
  .true-false-editor__saved-link {
    transition: none;
  }

  .true-false-editor__settings:active,
  .true-false-editor__save:active,
  .true-false-editor__saved-copy:active,
  .true-false-editor__saved-link:active {
    transform: none;
  }
}
</style>
