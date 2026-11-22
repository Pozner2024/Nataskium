<template>
  <div
    class="image-field"
    :class="[`image-field--${variant}`, { 'image-field--filled': imageUrl !== null, 'image-field--dragover': isDragOver }]"
    role="group"
    :aria-label="label"
    :aria-busy="status === 'uploading'"
    tabindex="0"
    @dragover.prevent="isDragOver = cropFile === null"
    @dragleave="onDragLeave"
    @drop.prevent="onDrop"
    @paste="onPaste"
  >
    <div v-if="imageUrl && variant === 'question'" class="image-field__frame">
      <img class="image-field__backdrop" :src="imageUrl" alt="" aria-hidden="true">
      <img class="image-field__frame-img" :src="imageUrl" alt="">
    </div>
    <img v-else-if="imageUrl" class="image-field__preview" :src="imageUrl" alt="">
    <p v-else class="image-field__hint">{{ t('teacher.quizEditor.image.hint') }}</p>
    <p v-if="!imageUrl && variant === 'question'" class="image-field__format">{{ t('teacher.quizEditor.image.formatQuestion') }}</p>

    <button class="image-field__pick" type="button" :disabled="status === 'uploading'" @click="fileInput?.click()">
      {{ imageUrl ? t('teacher.quizEditor.image.replace') : t('teacher.quizEditor.image.add') }}
    </button>
    <button
      v-if="imageUrl && sourceFile"
      class="image-field__recrop"
      type="button"
      :disabled="status === 'uploading'"
      :aria-label="t('teacher.quizEditor.image.recrop')"
      @click="cropFile = sourceFile"
    >
      {{ variant === 'option' ? t('teacher.quizEditor.image.recropShort') : t('teacher.quizEditor.image.recrop') }}
    </button>
    <button
      v-if="imageUrl"
      class="image-field__remove"
      type="button"
      :disabled="status === 'uploading'"
      :aria-label="t('teacher.quizEditor.image.remove')"
      @click="remove"
    >
      {{ variant === 'option' ? t('teacher.quizEditor.image.removeShort') : '✕' }}
    </button>
    <input
      ref="fileInput"
      class="image-field__input"
      type="file"
      :accept="ACCEPTED_IMAGE_TYPES.join(',')"
      hidden
      @change="onFileChange"
    >

    <p class="image-field__status" role="status">{{ status === 'uploading' ? t('teacher.quizEditor.image.uploading') : '' }}</p>
    <p v-if="errorMessage" class="image-field__error" role="alert">{{ errorMessage }}</p>

    <ImageCropDialog
      v-if="cropFile"
      :file="cropFile"
      :aspect="variant === 'question' ? QUESTION_IMAGE_ASPECT : OPTION_IMAGE_ASPECT"
      @done="onCropped"
      @cancel="cropFile = null"
      @failed="onCropFailed"
    />
  </div>
</template>

<script setup lang="ts">
import { IMAGE_TOO_LARGE_REASON, UNSUPPORTED_IMAGE_REASON } from '@nataskium/shared/schemas'
import { computed, onBeforeUnmount, ref } from 'vue'
import { useI18n } from '#imports'
import { ACCEPTED_IMAGE_TYPES, imageApi, pickImageFile, validateImageFile, type UploadedImage } from '@/entities/quiz'
import { authorizedRequest } from '@/features/auth'
import { ApiError } from '@/shared'
import { OPTION_IMAGE_ASPECT, QUESTION_IMAGE_ASPECT } from '../imageCrop'
import ImageCropDialog from './ImageCropDialog.vue'

type FieldStatus = 'idle' | 'uploading' | 'tooLarge' | 'notImage' | 'failed'

const PAYLOAD_TOO_LARGE_STATUS = 413
const BAD_REQUEST_STATUS = 400

const ERROR_KEYS: Partial<Record<FieldStatus, string>> = {
  tooLarge: 'teacher.quizEditor.image.tooLarge',
  notImage: 'teacher.quizEditor.image.notImage',
  failed: 'teacher.quizEditor.image.failed',
}

defineProps<{
  imageUrl: string | null
  // Исходный файл, если картинку загрузили в этом редакторе: тогда её можно обрезать заново
  sourceFile?: File | null
  variant: 'question' | 'option'
  // Подпись группы для скринридера: у вариантов кнопки одинаковые, без неё их не различить
  label?: string
}>()

const emit = defineEmits<{
  change: [image: UploadedImage | null, source?: File]
}>()

const { t } = useI18n()
const fileInput = ref<HTMLInputElement | null>(null)
const status = ref<FieldStatus>('idle')
const isDragOver = ref(false)
// Выбранный файл ждёт в окне обрезки; загружается только после «Готово» или «Не обрезать»
const cropFile = ref<File | null>(null)
// Поле убрали (вопрос свернули, вариант удалили) до конца загрузки — картинка уже не для него
let isUnmounted = false

const errorMessage = computed(() => {
  const key = ERROR_KEYS[status.value]
  return key === undefined ? '' : t(key)
})

function uploadErrorStatus(error: unknown): FieldStatus {
  if (!(error instanceof ApiError)) return 'failed'
  if (error.status === PAYLOAD_TOO_LARGE_STATUS) return 'tooLarge'
  if (error.status !== BAD_REQUEST_STATUS) return 'failed'
  if (error.reason === IMAGE_TOO_LARGE_REASON) return 'tooLarge'
  if (error.reason === UNSUPPORTED_IMAGE_REASON) return 'notImage'
  return 'failed'
}

function openCrop(file: File): void {
  if (status.value === 'uploading') return
  const check = validateImageFile(file)
  if (check !== 'ok') {
    status.value = check
    return
  }
  status.value = 'idle'
  cropFile.value = file
}

function onCropped(file: File): void {
  const source = cropFile.value ?? file
  cropFile.value = null
  void upload(file, source)
}

function onCropFailed(): void {
  cropFile.value = null
  status.value = 'notImage'
}

async function upload(file: File, source: File): Promise<void> {
  if (status.value === 'uploading') return
  status.value = 'uploading'
  try {
    const image = await authorizedRequest((accessToken) => imageApi.upload(file, accessToken))
    if (isUnmounted) return
    status.value = 'idle'
    emit('change', image, source)
  } catch (error) {
    if (isUnmounted) return
    status.value = uploadErrorStatus(error)
  }
}

// Файлы есть, но ни одной картинки — сообщаем; без файлов (перетащили текст) — молча игнорируем
function uploadFrom(source: DataTransfer | FileList | null): void {
  const file = pickImageFile(source)
  const files = source && 'files' in source ? source.files : source
  if (file) openCrop(file)
  else if (files && files.length > 0) status.value = 'notImage'
}

// dragleave приходит и при переходе на дочерний элемент поля: подсветку снимаем, только когда курсор ушёл из поля
function onDragLeave(event: DragEvent): void {
  const field = event.currentTarget as HTMLElement
  if (event.relatedTarget instanceof Node && field.contains(event.relatedTarget)) return
  isDragOver.value = false
}

// Окно обрезки лежит внутри поля: перетаскивание и вставка в нём не должны открывать новую картинку
function onDrop(event: DragEvent): void {
  isDragOver.value = false
  if (cropFile.value) return
  uploadFrom(event.dataTransfer)
}

function onPaste(event: ClipboardEvent): void {
  if (cropFile.value) return
  const file = pickImageFile(event.clipboardData)
  if (!file) return
  event.preventDefault()
  openCrop(file)
}

function onFileChange(event: Event): void {
  const input = event.target as HTMLInputElement
  uploadFrom(input.files)
  // Тот же файл можно выбрать снова (например, после ошибки сети)
  input.value = ''
}

function remove(): void {
  status.value = 'idle'
  emit('change', null)
}

onBeforeUnmount(() => {
  isUnmounted = true
})
</script>

<style scoped lang="scss">
$question-image-max-height: 34vh;

%button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  min-width: 44px;
  min-height: 44px;
  margin: 0;
  border: 0;
  border-radius: 12px;
  font: inherit;
  font-weight: 700;
  line-height: 1.2;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
  transition: background-color 0.2s ease;

  &:disabled {
    cursor: not-allowed;
    opacity: 0.45;
  }
}

.image-field {
  position: relative;
  display: grid;
  border: 2px dashed transparent;
  border-radius: 14px;
  transition:
    background-color 0.2s ease,
    border-color 0.2s ease;
}

.image-field--question {
  justify-items: center;
  padding: 10px 14px 14px;
  border-color: rgb(var(--rgb-blue) / 0.6);
  background: rgb(var(--rgb-blue) / 0.05);
  text-align: center;
}

// Рамка как в игре: 16:9 и не выше трети экрана
.image-field--question.image-field--filled {
  width: min(100%, #{$question-image-max-height} * 16 / 9);
  margin-inline: auto;
  justify-items: stretch;
  padding: 0;
  border-color: transparent;
  background: none;
}

.image-field--option {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0 6px;
}

.image-field--dragover,
.image-field--question.image-field--dragover {
  border-color: var(--color-blue);
  background: rgb(var(--rgb-blue) / 0.12);
}

.image-field__preview {
  display: block;
  grid-area: 1 / 1;
  border: 1px solid rgb(var(--rgb-blue) / 0.16);
  background: rgb(var(--rgb-blue) / 0.06);
  object-fit: contain;
  transition: opacity 0.2s ease;

  .image-field--option & {
    flex: none;
    width: 48px;
    height: 48px;
    border-radius: 10px;
  }

  .image-field[aria-busy='true'] & {
    opacity: 0.5;
  }
}

.image-field__frame {
  position: relative;
  grid-area: 1 / 1;
  aspect-ratio: 16 / 9;
  border: 1px solid rgb(var(--rgb-blue) / 0.16);
  border-radius: 12px;
  overflow: hidden;
  background: rgb(var(--rgb-blue) / 0.06);
  transition: opacity 0.2s ease;

  .image-field[aria-busy='true'] & {
    opacity: 0.5;
  }
}

.image-field__backdrop,
.image-field__frame-img {
  position: absolute;
  inset: 0;
  display: block;
  width: 100%;
  height: 100%;
}

// Картинка целиком, поля закрывает её размытая затемнённая копия — как в игре
.image-field__backdrop {
  object-fit: cover;
  filter: blur(18px) brightness(0.75);
  transform: scale(1.15);
}

.image-field__frame-img {
  object-fit: contain;
}

.image-field__hint {
  grid-row: 2;
  grid-column: 1;
  max-width: 32ch;
  margin: 4px 0 0;
  color: var(--color-text-muted);
  font-size: 14px;
  line-height: 1.4;

  .image-field--option & {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
  }
}

.image-field__format {
  grid-row: 3;
  grid-column: 1;
  max-width: 32ch;
  margin: 2px 0 0;
  color: var(--color-text-muted);
  font-size: 13px;
  line-height: 1.4;
}

.image-field__pick {
  @extend %button;

  grid-row: 1;
  grid-column: 1;
  padding: 0 14px;
  background: none;
  color: var(--color-blue-dark);
  font-size: 16px;

  &::before {
    content: '+';
    content: '+' / '';
    font-size: 22px;
    font-weight: 500;
    line-height: 1;
  }

  .image-field--option & {
    padding: 0 10px;
    font-size: 14px;
    font-weight: 600;
  }

  @media (hover: hover) {
    &:hover:not(:disabled) {
      background: rgb(var(--rgb-blue) / 0.1);
    }
  }

  &:active:not(:disabled) {
    background: rgb(var(--rgb-blue) / 0.18);
  }

  .image-field--filled & {
    &::before {
      content: none;
    }
  }

  .image-field--filled:not(.image-field--option) & {
    position: relative;
    font-size: 15px;
    align-self: end;
    justify-self: end;
    margin: 8px;
    background: var(--color-white);
    box-shadow: 0 2px 8px rgb(var(--rgb-night) / 0.18);

    @media (hover: hover) {
      &:hover:not(:disabled) {
        background: linear-gradient(rgb(var(--rgb-blue) / 0.1), rgb(var(--rgb-blue) / 0.1)), var(--color-white);
      }
    }

    &:active:not(:disabled) {
      background: linear-gradient(rgb(var(--rgb-blue) / 0.18), rgb(var(--rgb-blue) / 0.18)), var(--color-white);
    }
  }

  .image-field--filled.image-field--option & {
    background: rgb(var(--rgb-blue) / 0.1);

    @media (hover: hover) {
      &:hover:not(:disabled) {
        background: rgb(var(--rgb-blue) / 0.18);
      }
    }

    &:active:not(:disabled) {
      background: rgb(var(--rgb-blue) / 0.26);
    }
  }
}

// У вопроса — белая кнопка в левом нижнем углу картинки, у варианта — в ряду с остальными
.image-field__recrop {
  @extend %button;

  position: relative;
  padding: 0 14px;
  color: var(--color-blue-dark);

  .image-field--question & {
    grid-area: 1 / 1;
    align-self: end;
    justify-self: start;
    margin: 8px;
    background: var(--color-white);
    box-shadow: 0 2px 8px rgb(var(--rgb-night) / 0.18);
    font-size: 15px;

    @media (hover: hover) {
      &:hover:not(:disabled) {
        background: linear-gradient(rgb(var(--rgb-blue) / 0.1), rgb(var(--rgb-blue) / 0.1)), var(--color-white);
      }
    }
  }

  .image-field--option & {
    padding: 0 10px;
    background: rgb(var(--rgb-blue) / 0.1);
    font-size: 14px;
    font-weight: 600;

    @media (hover: hover) {
      &:hover:not(:disabled) {
        background: rgb(var(--rgb-blue) / 0.18);
      }
    }
  }
}

.image-field__remove {
  @extend %button;

  color: var(--color-text);

  .image-field--question & {
    position: relative;
    grid-area: 1 / 1;
    align-self: start;
    justify-self: end;
    width: 44px;
    margin: 8px;
    padding: 0;
    border-radius: 50%;
    background: var(--color-white);
    box-shadow: 0 2px 8px rgb(var(--rgb-night) / 0.18);
    font-size: 18px;

    @media (hover: hover) {
      &:hover:not(:disabled) {
        background: linear-gradient(rgb(var(--rgb-orange) / 0.16), rgb(var(--rgb-orange) / 0.16)), var(--color-white);
      }
    }

    &:active:not(:disabled) {
      background: linear-gradient(rgb(var(--rgb-orange) / 0.28), rgb(var(--rgb-orange) / 0.28)), var(--color-white);
    }
  }

  .image-field--option & {
    padding: 0 10px;
    background: rgb(var(--rgb-blue) / 0.1);
    color: var(--color-blue-dark);
    font-size: 14px;
    font-weight: 600;

    @media (hover: hover) {
      &:hover:not(:disabled) {
        background: rgb(var(--rgb-blue) / 0.18);
      }
    }

    &:active:not(:disabled) {
      background: rgb(var(--rgb-blue) / 0.26);
    }
  }
}

.image-field__status,
.image-field__error {
  flex-basis: 100%;
  grid-column: 1;
  margin: 0;
  font-size: 15px;
  line-height: 1.4;
}

.image-field__status {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  color: var(--color-text-muted);

  .image-field--option & {
    justify-content: flex-start;
  }

  .image-field[aria-busy='true'] & {
    margin-top: 8px;

    &::before {
      content: '';
      flex: none;
      width: 16px;
      height: 16px;
      border: 2px solid rgb(var(--rgb-blue) / 0.25);
      border-top-color: var(--color-blue-dark);
      border-radius: 50%;
      animation: image-field-spin 0.8s linear infinite;
    }
  }
}

// Текст ошибки тёмный, знак оранжевый: оранжево-тёмный текст на белом дал бы 3.6:1
.image-field__error {
  display: flex;
  align-items: flex-start;
  justify-content: center;
  gap: 8px;
  margin-top: 8px;
  font-weight: 500;
  text-align: start;

  .image-field--option &,
  .image-field--filled & {
    justify-content: flex-start;
  }

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

@keyframes image-field-spin {
  to {
    transform: rotate(1turn);
  }
}

@media (prefers-reduced-motion: reduce) {
  .image-field,
  .image-field__frame,
  .image-field__preview,
  .image-field__pick,
  .image-field__remove {
    transition: none;
  }

  .image-field[aria-busy='true'] .image-field__status::before {
    animation: none;
  }
}
</style>
