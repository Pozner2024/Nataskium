<template>
  <AppDialog :open="true" :title="t('teacher.quizEditor.crop.title')" @update:open="onOpenChange">
    <div class="image-crop">
      <div
        ref="frame"
        class="image-crop__frame"
        :class="{ 'image-crop__frame--dragging': dragStart !== null }"
        :style="{ aspectRatio: aspect }"
        role="group"
        :aria-label="t('teacher.quizEditor.crop.frameLabel')"
        tabindex="0"
        @pointerdown="onPointerDown"
        @pointermove="onPointerMove"
        @pointerup="dragStart = null"
        @pointercancel="dragStart = null"
        @keydown="onKeydown"
      >
        <img v-if="crop" class="image-crop__img" :src="sourceUrl" alt="" draggable="false" :style="imageStyle">
      </div>
      <p class="image-crop__caption">{{ t('teacher.quizEditor.crop.caption') }}</p>

      <label class="image-crop__zoom">
        <span class="image-crop__zoom-label">{{ t('teacher.quizEditor.crop.zoom') }}</span>
        <input
          v-model.number="zoom"
          class="image-crop__range"
          type="range"
          :min="MIN_CROP_ZOOM"
          :max="MAX_CROP_ZOOM"
          :step="ZOOM_SLIDER_STEP"
          :disabled="!crop"
        >
      </label>
    </div>

    <template #actions>
      <button class="image-crop__done" type="button" :disabled="!crop || busy" @click="done">
        {{ t('teacher.quizEditor.crop.done') }}
      </button>
      <button class="image-crop__secondary" type="button" :disabled="busy" @click="emit('done', file)">
        {{ t('teacher.quizEditor.crop.noCrop') }}
      </button>
      <button class="image-crop__secondary" type="button" :disabled="busy" @click="emit('cancel')">
        {{ t('teacher.quizEditor.crop.cancel') }}
      </button>
    </template>
  </AppDialog>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, shallowRef, useTemplateRef } from 'vue'
import { useI18n } from '#imports'
import { AppDialog } from '@/shared'
import {
  MAX_CROP_ZOOM,
  MIN_CROP_ZOOM,
  clampCenter,
  cropOutputType,
  cropRect,
  renderCrop,
  type CropCenter,
  type ImageSize,
} from '../imageCrop'

const ZOOM_SLIDER_STEP = 0.01
const ZOOM_KEY_STEP = 0.1
// Стрелка сдвигает картинку на эту долю рамки
const MOVE_KEY_STEP = 0.05

const props = defineProps<{
  file: File
  aspect: number
}>()

const emit = defineEmits<{
  done: [file: File]
  cancel: []
  failed: []
}>()

const { t } = useI18n()
const frame = useTemplateRef<HTMLElement>('frame')
// Окно открывается только после выбора файла, на сервере не рендерится
const sourceUrl = URL.createObjectURL(props.file)
const image = shallowRef<HTMLImageElement | null>(null)
const zoom = ref(MIN_CROP_ZOOM)
const center = ref<CropCenter>({ x: 0.5, y: 0.5 })
const busy = ref(false)
const dragStart = ref<{ x: number; y: number } | null>(null)

const size = computed<ImageSize | null>(() =>
  image.value ? { width: image.value.naturalWidth, height: image.value.naturalHeight } : null,
)

const crop = computed(() => (size.value ? cropRect(size.value, props.aspect, zoom.value, center.value) : null))

// Картинка позиционируется в процентах рамки: размер рамки на экране не важен
const imageStyle = computed(() => {
  if (!crop.value || !size.value) return {}
  const { x, y, width, height } = crop.value
  return {
    width: `${(size.value.width / width) * 100}%`,
    height: `${(size.value.height / height) * 100}%`,
    left: `${(-x / width) * 100}%`,
    top: `${(-y / height) * 100}%`,
  }
})

// Сдвиг картинки на долю рамки; картинка едет вслед за пальцем, поэтому центр рамки — в обратную сторону
function moveBy(frameShareX: number, frameShareY: number): void {
  if (!crop.value || !size.value) return
  const next = {
    x: center.value.x - (frameShareX * crop.value.width) / size.value.width,
    y: center.value.y - (frameShareY * crop.value.height) / size.value.height,
  }
  center.value = clampCenter(size.value, props.aspect, zoom.value, next)
}

function setZoom(value: number): void {
  zoom.value = Math.min(Math.max(value, MIN_CROP_ZOOM), MAX_CROP_ZOOM)
}

function onPointerDown(event: PointerEvent): void {
  if (!crop.value) return
  frame.value?.setPointerCapture(event.pointerId)
  dragStart.value = { x: event.clientX, y: event.clientY }
}

function onPointerMove(event: PointerEvent): void {
  if (!dragStart.value || !frame.value) return
  const rect = frame.value.getBoundingClientRect()
  moveBy((event.clientX - dragStart.value.x) / rect.width, (event.clientY - dragStart.value.y) / rect.height)
  dragStart.value = { x: event.clientX, y: event.clientY }
}

const KEY_MOVES: Record<string, [number, number]> = {
  ArrowLeft: [-MOVE_KEY_STEP, 0],
  ArrowRight: [MOVE_KEY_STEP, 0],
  ArrowUp: [0, -MOVE_KEY_STEP],
  ArrowDown: [0, MOVE_KEY_STEP],
}

const KEY_ZOOMS: Record<string, number> = { '+': ZOOM_KEY_STEP, '=': ZOOM_KEY_STEP, '-': -ZOOM_KEY_STEP }

function onKeydown(event: KeyboardEvent): void {
  const move = KEY_MOVES[event.key]
  const zoomStep = KEY_ZOOMS[event.key]
  if (move === undefined && zoomStep === undefined) return
  event.preventDefault()
  if (move) moveBy(...move)
  else setZoom(zoom.value + (zoomStep ?? 0))
}

function onOpenChange(open: boolean): void {
  if (!open) emit('cancel')
}

async function done(): Promise<void> {
  if (!image.value || !crop.value) return
  busy.value = true
  try {
    const type = cropOutputType(props.file.type)
    const blob = await renderCrop(image.value, crop.value, type)
    emit('done', new File([blob], props.file.name, { type }))
  } catch {
    emit('failed')
  }
}

onMounted(async () => {
  const element = new Image()
  element.src = sourceUrl
  try {
    await element.decode()
    image.value = element
  } catch {
    emit('failed')
  }
})

onBeforeUnmount(() => URL.revokeObjectURL(sourceUrl))
</script>

<style scoped lang="scss">
.image-crop {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.image-crop__frame {
  position: relative;
  width: 100%;
  border-radius: 14px;
  overflow: hidden;
  background: rgb(var(--rgb-blue) / 0.06);
  cursor: grab;
  touch-action: none;
  user-select: none;

  &:focus-visible {
    outline: 3px solid var(--color-blue);
    outline-offset: 3px;
  }
}

.image-crop__frame--dragging {
  cursor: grabbing;
}

.image-crop__img {
  position: absolute;
  display: block;
  max-width: none;
  pointer-events: none;
}

.image-crop__caption {
  margin: 0;
  color: var(--color-text-muted);
  font-size: 14px;
  line-height: 1.4;
  text-align: center;
}

.image-crop__zoom {
  display: flex;
  align-items: center;
  gap: 12px;
  min-height: 44px;
}

.image-crop__zoom-label {
  flex: none;
  font-size: 15px;
  font-weight: 600;
}

.image-crop__range {
  flex: 1;
  min-width: 0;
  accent-color: var(--color-blue-dark);
}

%action-button {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  min-height: 48px;
  padding: 8px 16px;
  border: 0;
  border-radius: 999px;
  font: inherit;
  font-weight: 700;
  line-height: 1.25;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
  transition: background-color 0.2s ease;

  &:disabled {
    cursor: not-allowed;
    opacity: 0.45;
  }
}

.image-crop__done {
  @extend %action-button;

  background: var(--color-blue-dark);
  color: var(--color-white);

  @media (hover: hover) {
    &:hover:not(:disabled) {
      background: var(--color-blue);
    }
  }
}

.image-crop__secondary {
  @extend %action-button;

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
  .image-crop__done,
  .image-crop__secondary {
    transition: none;
  }
}
</style>
