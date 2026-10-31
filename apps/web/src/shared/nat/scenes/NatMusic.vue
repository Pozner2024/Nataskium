<template>
  <NatRobot class="nat-music" label="Нат-музыкант. Нажми, чтобы он спел" follows-cursor :view-box="bounds.viewBox" @press="onPress">
    <template #defs>
      <!-- стан гаснет к краям сцены -->
      <linearGradient :id="ids.staffFade" :x1="bounds.left" y1="0" :x2="bounds.right" y2="0" gradientUnits="userSpaceOnUse">
        <stop offset="0" stop-color="#4573F4" stop-opacity="0" />
        <stop offset=".18" stop-color="#4573F4" stop-opacity=".55" />
        <stop offset=".82" stop-color="#4573F4" stop-opacity=".55" />
        <stop offset="1" stop-color="#4573F4" stop-opacity="0" />
      </linearGradient>
      <linearGradient :id="ids.phones" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="#93B0F9" />
        <stop offset=".5" stop-color="#4573F4" />
        <stop offset="1" stop-color="#2549C5" />
      </linearGradient>
    </template>

    <template #back>
      <g fill="none" :stroke="`url(#${ids.staffFade})`" stroke-width="1.6">
        <path v-for="(d, index) in scene.staffLines" :key="index" :d="d" />
      </g>
      <g>
        <NatMusicNote v-for="{ key, ...note } in scene.staffNotes" :key="key" v-bind="note" />
      </g>
      <path d="M104 262 Q100 108 255 104 Q410 108 406 262" fill="none" stroke="#2E3548" stroke-width="14" stroke-linecap="round" />
      <path d="M110 250 Q108 116 255 112 Q402 116 400 250" fill="none" stroke="#4573F4" stroke-width="3" stroke-opacity=".6" />
    </template>

    <template #front>
      <g>
        <g class="nat-music__cup">
          <rect x="84" y="232" width="36" height="84" rx="16" :fill="`url(#${ids.phones})`" />
          <rect x="90" y="242" width="8" height="40" rx="4" fill="#fff" opacity=".4" />
        </g>
        <g class="nat-music__cup">
          <rect x="390" y="232" width="36" height="84" rx="16" :fill="`url(#${ids.phones})`" />
          <rect x="396" y="242" width="8" height="40" rx="4" fill="#fff" opacity=".4" />
        </g>
      </g>
      <NatMusicNote v-for="{ key, ...note } in scene.sungNotes" :key="key" v-bind="note" />
    </template>
  </NatRobot>
</template>

<script setup lang="ts">
import { onUnmounted, shallowRef, useId } from 'vue'
import NatRobot from '../NatRobot.vue'
import NatMusicNote from '../parts/NatMusicNote.vue'
import { RAD_TO_DEG } from '../lib/spring'
import { useFrameLoop } from '../lib/useFrameLoop'

const props = defineProps<{
  compact?: boolean
}>()

const CENTER = { x: 255, y: 280.5 }
const STAFF = { y: 300, gap: 13, amplitude: 22, wave: 0.012, flow: 1.6 }
const STAFF_LINE_COUNT = 5
const STAFF_STEP_X = 14
// Нотный стан тянется от края до края сцены и растворяется к краям.
// Компактная сцена для узких блоков: стан короче, без пустых полей сверху и снизу
const WIDE_BOUNDS = { left: -95, right: 615, viewBox: '-95 -40 710 620' }
const COMPACT_BOUNDS = { left: -45, right: 555, viewBox: '-45 70 600 380' }
const bounds = props.compact ? COMPACT_BOUNDS : WIDE_BOUNDS
const LEFT = bounds.left
const RIGHT = bounds.right
const COLORS = ['#2549C5', '#4573F4', '#5BA339', '#E98D34', '#B04FD8']
const STAFF_NOTE_COUNT = 9
// Высота ноты на стане: шаг = половина промежутка между линейками
const STAFF_NOTE_STEPS = [-4, -2, 0, 1, 3, -1, 2, 4, -3]
const STAFF_NOTE_SPEED = 58
const STAFF_FADE_WIDTH = 90
const SING_RADIUS = 140
const SUNG_LIFE_S = 2.8
const BURST_NOTES = 6
const PAIR_CHANCE = 0.35
const MAX_DT_S = 0.05
const JOY_SPEED = 2
const SPEED_EASING = 0.03
// До-ре-ми-соль-ля-до и короткое арпеджио по ним
const MELODY_FREQUENCIES = [523.25, 587.33, 659.25, 783.99, 880, 1046.5]
const MELODY_ORDER = [0, 2, 4, 3, 5]
const MELODY_STEP_S = 0.13
const MELODY_VOLUME = 0.16

interface SungNote {
  key: number
  x: number
  y: number
  vx: number
  vy: number
  life: number
  sway: number
  size: number
  isPair: boolean
  color: string
}

const uid = useId()
const ids = {
  staffFade: `${uid}-staff-fade`,
  phones: `${uid}-phones`,
}

const staffNotes = Array.from({ length: STAFF_NOTE_COUNT }, (_, i) => ({
  key: i,
  x: LEFT + i * (RIGHT - LEFT) / STAFF_NOTE_COUNT,
  step: STAFF_NOTE_STEPS[i]!,
  isPair: i % 3 === 1,
  color: COLORS[i % COLORS.length]!,
}))
const sungNotes: SungNote[] = []
let sungKey = 0
let time = 0
let nextSing = 0.6
let speed = 1

function waveY(x: number) {
  return STAFF.y + STAFF.amplitude * Math.sin(x * STAFF.wave - time * STAFF.flow)
}

function sing(isBurst: boolean) {
  const side = Math.random() < 0.5 ? -1 : 1
  const a = -Math.PI / 2 + side * (0.35 + Math.random() * 0.5)
  sungNotes.push({
    key: sungKey++,
    x: CENTER.x + SING_RADIUS * Math.cos(a),
    y: CENTER.y + SING_RADIUS * Math.sin(a),
    vx: side * (18 + Math.random() * 22) * (isBurst ? 2.2 : 1),
    vy: -(42 + Math.random() * 25) * (isBurst ? 1.6 : 1),
    life: 0,
    sway: Math.random() * 6.28,
    size: 0.7 + Math.random() * 0.45,
    isPair: Math.random() < PAIR_CHANCE,
    color: COLORS[Math.floor(Math.random() * COLORS.length)]!,
  })
}

function step(dt: number) {
  time += dt
  for (const note of staffNotes) {
    note.x += dt * STAFF_NOTE_SPEED
    if (note.x > RIGHT + 30) note.x -= (RIGHT - LEFT) + 60
  }
  nextSing -= dt
  if (nextSing <= 0) {
    sing(false)
    nextSing = 0.9 + Math.random() * 0.8
  }
  for (let k = sungNotes.length - 1; k >= 0; k--) {
    const note = sungNotes[k]!
    note.life += dt / SUNG_LIFE_S
    if (note.life >= 1) {
      sungNotes.splice(k, 1)
      continue
    }
    note.x += note.vx * dt
    note.y += note.vy * dt
  }
}

function calcScene() {
  const staffLines = Array.from({ length: STAFF_LINE_COUNT }, (_, i) => {
    const offset = (i - 2) * STAFF.gap
    let d = ''
    for (let x = LEFT; x <= RIGHT; x += STAFF_STEP_X) d += `${d ? 'L' : 'M'}${x} ${(waveY(x) + offset).toFixed(1)} `
    return d
  })
  const staffNoteViews = staffNotes.map((note) => {
    const y = waveY(note.x) + note.step * STAFF.gap / 2
    // Нота наклоняется по касательной к волне — «катится» по стану
    const slope = Math.atan(STAFF.amplitude * STAFF.wave * Math.cos(note.x * STAFF.wave - time * STAFF.flow)) * RAD_TO_DEG
    const fade = Math.min(1, (note.x - LEFT) / STAFF_FADE_WIDTH, (RIGHT - note.x) / STAFF_FADE_WIDTH)
    return {
      key: note.key,
      isPair: note.isPair,
      color: note.color,
      transform: `translate(${note.x.toFixed(1)} ${y.toFixed(1)}) rotate(${slope.toFixed(1)})`,
      opacity: Math.max(0, fade).toFixed(2),
    }
  })
  const sungNoteViews = sungNotes.map((note) => {
    const pop = Math.min(1, note.life * 6)
    const wobble = Math.sin(time * 4 + note.sway) * 12
    return {
      key: note.key,
      isPair: note.isPair,
      color: note.color,
      transform: `translate(${note.x.toFixed(1)} ${note.y.toFixed(1)}) rotate(${wobble.toFixed(1)}) scale(${(note.size * pop).toFixed(3)})`,
      opacity: (1 - note.life).toFixed(2),
    }
  })
  return { staffLines, staffNotes: staffNoteViews, sungNotes: sungNoteViews }
}

const scene = shallowRef(calcScene())

const { requestFrame } = useFrameLoop((rawDt) => {
  step(Math.min(rawDt, MAX_DT_S) * speed)
  speed += (1 - speed) * SPEED_EASING
  scene.value = calcScene()
})

// Звук только по действию пользователя — сам Нат никогда не включает музыку
let audio: AudioContext | null = null

function playMelody() {
  audio ??= new AudioContext()
  const context = audio
  MELODY_ORDER.forEach((noteIndex, i) => {
    const start = context.currentTime + i * MELODY_STEP_S
    const oscillator = context.createOscillator()
    const gain = context.createGain()
    oscillator.type = 'sine'
    oscillator.frequency.value = MELODY_FREQUENCIES[noteIndex]!
    gain.gain.setValueAtTime(0, start)
    gain.gain.linearRampToValueAtTime(MELODY_VOLUME, start + 0.02)
    gain.gain.exponentialRampToValueAtTime(0.001, start + 0.45)
    oscillator.connect(gain).connect(context.destination)
    oscillator.start(start)
    oscillator.stop(start + 0.5)
  })
}

onUnmounted(() => {
  void audio?.close()
})

function onPress() {
  speed = JOY_SPEED
  playMelody()
  for (let i = 0; i < BURST_NOTES; i++) sing(true)
  requestFrame()
}
</script>

<style scoped lang="scss">
// Нат покачивается в такт — примерно 110 ударов в минуту, чашки наушников пульсируют на каждый удар
.nat-music {
  :deep(.nat-robot__float) {
    transform-origin: 50% 80%;
    animation: nat-groove 1.09s ease-in-out infinite;
  }

  &__cup {
    transform-box: fill-box;
    transform-origin: center;
    animation: nat-thump 0.545s ease-out infinite;
  }
}

.nat-music :deep(.nat-figure--happy) .nat-music__cup {
  animation-name: nat-thump-big;
}

@keyframes nat-groove {
  0%,
  100% {
    transform: translateY(2px) rotate(-3deg);
  }

  25% {
    transform: translateY(-8px) rotate(0deg);
  }

  50% {
    transform: translateY(2px) rotate(3deg);
  }

  75% {
    transform: translateY(-8px) rotate(0deg);
  }
}

@keyframes nat-thump {
  0% {
    transform: scale(1.07);
  }

  60%,
  100% {
    transform: scale(1);
  }
}

@keyframes nat-thump-big {
  0% {
    transform: scale(1.16);
  }

  60%,
  100% {
    transform: scale(1);
  }
}

@media (prefers-reduced-motion: reduce) {
  .nat-music {
    :deep(.nat-robot__float),
    &__cup {
      animation: none;
    }
  }
}
</style>
