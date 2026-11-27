<template>
  <div ref="root" class="nataskium-scene" :class="`nataskium-scene--${tone}`" aria-hidden="true">
    <div ref="pcb" class="nataskium-scene__pcb" />
    <svg
      v-if="layout && showLogo"
      ref="logo"
      class="nataskium-scene__logo"
      :class="{ 'nataskium-scene__logo--waiting': phase === 'playing' }"
      :viewBox="LOGO_VIEW_BOX"
      :style="logoStyle"
      focusable="false"
    >
      <path
        v-for="(path, letter) in NAT_GLYPHS"
        :key="letter"
        :ref="(element) => keepLetter(letter, element)"
        class="nataskium-scene__nat"
        fill-rule="evenodd"
        :d="path"
      />
      <path
        v-for="(path, letter) in ASKIUM_GLYPHS"
        :key="letter"
        :ref="(element) => keepLetter(letter, element)"
        class="nataskium-scene__askium"
        fill-rule="evenodd"
        :d="path"
      />
      <path ref="idot" class="nataskium-scene__askium" fill-rule="evenodd" :d="I_DOT_PATH" />
      <path
        v-for="(path, letter) in ALL_LETTERS"
        :key="`outline-${letter}`"
        :ref="(element) => keepOutline(letter, element)"
        class="nataskium-scene__outline"
        pathLength="1"
        :d="path"
      />
      <!-- Робот поверх букв: он проезжает по слову и оставляет буквы за собой -->
      <g ref="robot">
        <path ref="head" class="nataskium-scene__nat" fill-rule="evenodd" :d="HEAD_PATH" />
        <path ref="antenna" class="nataskium-scene__askium" fill-rule="evenodd" :d="ANTENNA_PATH" />
        <rect
          v-for="eye in EYES"
          :key="eye.key"
          :ref="(element) => keepEye(eye.key, element)"
          class="nataskium-scene__eye"
          :x="eye.x"
          :y="eye.y"
          :width="eye.width"
          :height="eye.height"
          :rx="eye.radius"
        />
      </g>
    </svg>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, useTemplateRef } from 'vue'
import type { IntroSound, IntroThemeTone } from '../types'
import { loadGsap } from '../loadGsap'
import { introLayout } from './layout'
import { ANTENNA_PATH, ASKIUM_GLYPHS, EYES, HEAD_PATH, I_DOT_PATH, LOGO_VIEW_BOX, NAT_GLYPHS } from './logoPaths'
import { buildIntroTimeline, type SceneElements } from './timeline'

type Letter = keyof SceneElements['letters']
type Phase = 'idle' | 'playing' | 'clean'

// clean — чистая сцена, на которой живёт игра; assembled — собранное лого (только для проверки на /intro-preview)
const { tone, state = 'clean', sound = null } = defineProps<{
  tone: IntroThemeTone
  state?: 'clean' | 'assembled'
  sound?: IntroSound | null
}>()

const emit = defineEmits<{ clean: [] }>()

const ALL_LETTERS = { ...NAT_GLYPHS, ...ASKIUM_GLYPHS }
const root = useTemplateRef<HTMLDivElement>('root')
const pcb = useTemplateRef<HTMLDivElement>('pcb')
const logo = useTemplateRef<SVGSVGElement>('logo')
const robot = useTemplateRef<SVGGElement>('robot')
const head = useTemplateRef<SVGPathElement>('head')
const antenna = useTemplateRef<SVGPathElement>('antenna')
const idot = useTemplateRef<SVGPathElement>('idot')
const letters: Partial<Record<Letter, Element>> = {}
const outlines: Partial<Record<Letter, Element>> = {}
const eyes: Partial<Record<(typeof EYES)[number]['key'], Element>> = {}

const size = ref<{ width: number; height: number } | null>(null)
const phase = ref<Phase>('idle')
let resizeObserver: ResizeObserver | null = null
let context: { revert: () => void } | null = null
let finishPlay: (() => void) | null = null
let timeline: { progress: (value: number) => unknown } | null = null

const layout = computed(() => (size.value ? introLayout(size.value.width, size.value.height) : null))
const showLogo = computed(() => state === 'assembled' || phase.value === 'playing')

const logoStyle = computed(() => {
  if (!layout.value) return {}
  const { left, top, width, height } = layout.value.logo
  return { left: `${left}px`, top: `${top}px`, width: `${width}px`, height: `${height}px` }
})

function keepLetter(letter: string, element: unknown) {
  if (element instanceof Element) letters[letter as Letter] = element
}

function keepOutline(letter: string, element: unknown) {
  if (element instanceof Element) outlines[letter as Letter] = element
}

function keepEye(key: string, element: unknown) {
  if (element instanceof Element) eyes[key as keyof typeof eyes] = element
}

function sceneElements(): SceneElements | null {
  const { left, right } = eyes
  if (!pcb.value || !logo.value || !robot.value || !head.value || !antenna.value || !idot.value || !left || !right) return null
  return {
    pcb: pcb.value,
    logo: logo.value,
    robot: robot.value,
    head: head.value,
    antenna: antenna.value,
    leftEye: left,
    rightEye: right,
    idot: idot.value,
    letters: letters as Record<Letter, Element>,
    outlines: outlines as Record<Letter, Element>,
  }
}

function finish() {
  context?.revert()
  context = null
  timeline = null
  phase.value = 'clean'
  finishPlay?.()
  finishPlay = null
  emit('clean')
}

// Играет интро и резолвится на чистой сцене. Без анимации (reduced motion, GSAP не загрузился) — сразу чистая сцена
async function play(): Promise<void> {
  if (phase.value === 'playing') return
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return finish()
  phase.value = 'playing'
  const done = new Promise<void>((resolve) => (finishPlay = resolve))
  try {
    const gsap = await loadGsap()
    await nextTick()
    // Пока грузился GSAP, интро пропустили: чистая сцена уже показана
    if (phase.value !== 'playing') return done
    const elements = sceneElements()
    if (!elements || !layout.value) return finish()
    const sceneLayout = layout.value
    context = gsap.context(() => {
      const tl = buildIntroTimeline(gsap, elements, sceneLayout, (name) => sound?.play(name))
      tl.eventCallback('onComplete', finish)
      timeline = tl
      tl.play()
    }, root.value ?? undefined)
  } catch {
    if (phase.value === 'playing') finish()
  }
  return done
}

// «Пропустить»: сразу чистая сцена
function skip() {
  if (phase.value !== 'playing') return
  if (timeline) timeline.progress(1)
  else finish()
}

function measure() {
  const element = root.value
  if (!element) return
  const { width, height } = element.getBoundingClientRect()
  const next = width > 0 && height > 0 ? { width, height } : null
  const changed = next?.width !== size.value?.width || next?.height !== size.value?.height
  size.value = next
  // Раскладка интро считается один раз на старте: смена размера посреди интро (полный экран, поворот) — как пропуск
  if (changed && phase.value === 'playing' && timeline) skip()
}

onMounted(() => {
  measure()
  if (typeof ResizeObserver === 'undefined' || !root.value) return
  resizeObserver = new ResizeObserver(measure)
  resizeObserver.observe(root.value)
})

onBeforeUnmount(() => {
  phase.value = 'clean'
  resizeObserver?.disconnect()
  context?.revert()
  context = null
  timeline = null
  finishPlay?.()
  finishPlay = null
})

defineExpose({ play, skip })
</script>

<style scoped lang="scss">
@use '@/assets/styles/mixins' as *;

.nataskium-scene {
  position: absolute;
  inset: 0;
  overflow: hidden;
  pointer-events: none;
  background: var(--scene-bg);

  &--dark {
    --scene-bg: linear-gradient(180deg, #1a1f45 0%, var(--color-night) 55%, #12162f 100%);
    --scene-pcb-opacity: 0.6;
    --scene-nat: var(--color-white);
    --scene-askium: var(--color-blue);
    --scene-eye: var(--color-white);
    --scene-outline: #e4ecff;
  }

  &--light {
    --scene-bg: linear-gradient(180deg, var(--color-white) 0%, #f7f9fe 60%, #eef2fc 100%);
    --scene-pcb-opacity: 0.22;
    --scene-nat: var(--color-text);
    --scene-askium: var(--color-blue);
    --scene-eye: var(--color-text);
    // Контур букв как карандашный набросок цветом «N», «a» и «t»
    --scene-outline: var(--color-text);
  }

  &__pcb {
    position: absolute;
    inset: 0;
    opacity: var(--scene-pcb-opacity);
    background: url($board-pattern) 0 0 / #{$board-tile-size} auto repeat;
    -webkit-mask-image:
      radial-gradient(ellipse 70% 60% at 100% 0%, #000 0%, transparent 100%),
      radial-gradient(ellipse 70% 60% at 0% 100%, #000 0%, transparent 100%);
    mask-image:
      radial-gradient(ellipse 70% 60% at 100% 0%, #000 0%, transparent 100%),
      radial-gradient(ellipse 70% 60% at 0% 100%, #000 0%, transparent 100%);
  }

  &__logo {
    position: absolute;
    overflow: visible;

    // До готовности таймлайна лого не видно, иначе на кадр мелькнёт собранное слово
    &--waiting {
      visibility: hidden;
    }
  }

  &__nat {
    fill: var(--scene-nat);
  }

  &__askium {
    fill: var(--scene-askium);
  }

  &__eye {
    fill: var(--scene-eye);
  }

  &__outline {
    fill: none;
    stroke: var(--scene-outline);
    stroke-width: 5;
    stroke-linejoin: round;
    stroke-dasharray: 1;
    opacity: 0;
  }
}
</style>
