<template>
  <div
    class="image-field"
    :class="[`image-field--${variant}`, { 'image-field--filled': imageUrl !== null }]"
    role="group"
    :aria-label="label"
    :aria-busy="status === 'uploading'"
    tabindex="0"
    @dragover.prevent
    @drop.prevent="onDrop"
    @paste="onPaste"
  >
    <img v-if="imageUrl" class="image-field__preview" :src="imageUrl" alt="">
    <p v-else class="image-field__hint">{{ t('teacher.quizEditor.image.hint') }}</p>

    <button class="image-field__pick" type="button" :disabled="status === 'uploading'" @click="fileInput?.click()">
      {{ imageUrl ? t('teacher.quizEditor.image.replace') : t('teacher.quizEditor.image.add') }}
    </button>
    <button
      v-if="imageUrl"
      class="image-field__remove"
      type="button"
      :disabled="status === 'uploading'"
      :aria-label="t('teacher.quizEditor.image.remove')"
      @click="remove"
    >
      ✕
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
  </div>
</template>

<script setup lang="ts">
import { IMAGE_TOO_LARGE_REASON, UNSUPPORTED_IMAGE_REASON } from '@nataskium/shared/schemas'
import { computed, onBeforeUnmount, ref } from 'vue'
import { useI18n } from '#imports'
import { ACCEPTED_IMAGE_TYPES, imageApi, pickImageFile, validateImageFile, type UploadedImage } from '@/entities/quiz'
import { authorizedRequest } from '@/features/auth'
import { ApiError } from '@/shared'

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
  variant: 'question' | 'option'
  // Подпись группы для скринридера: у вариантов кнопки одинаковые, без неё их не различить
  label?: string
}>()

const emit = defineEmits<{
  change: [image: UploadedImage | null]
}>()

const { t } = useI18n()
const fileInput = ref<HTMLInputElement | null>(null)
const status = ref<FieldStatus>('idle')
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

async function upload(file: File): Promise<void> {
  if (status.value === 'uploading') return
  const check = validateImageFile(file)
  if (check !== 'ok') {
    status.value = check
    return
  }
  status.value = 'uploading'
  try {
    const image = await authorizedRequest((accessToken) => imageApi.upload(file, accessToken))
    if (isUnmounted) return
    status.value = 'idle'
    emit('change', image)
  } catch (error) {
    if (isUnmounted) return
    status.value = uploadErrorStatus(error)
  }
}

// Файлы есть, но ни одной картинки — сообщаем; без файлов (перетащили текст) — молча игнорируем
function uploadFrom(source: DataTransfer | FileList | null): void {
  const file = pickImageFile(source)
  const files = source && 'files' in source ? source.files : source
  if (file) void upload(file)
  else if (files && files.length > 0) status.value = 'notImage'
}

function onDrop(event: DragEvent): void {
  uploadFrom(event.dataTransfer)
}

function onPaste(event: ClipboardEvent): void {
  const file = pickImageFile(event.clipboardData)
  if (!file) return
  event.preventDefault()
  void upload(file)
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
