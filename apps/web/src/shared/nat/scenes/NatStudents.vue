<template>
  <button ref="root" class="nat-students" :class="{ 'nat-students--paused': isPaused }" type="button" :style="{ '--scene-width': stage.width }" aria-label="Два Ната-студента с ноутбуками. Нажми, чтобы они начали переписываться" @click="onPress">
    <svg ref="svg" class="nat-students__svg" :viewBox="`${stage.x} 40 ${stage.width} 440`" aria-hidden="true">
      <defs>
        <linearGradient :id="ids.lid" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stop-color="#E9EDF6" />
          <stop offset=".55" stop-color="#C3CADB" />
          <stop offset="1" stop-color="#9AA3BA" />
        </linearGradient>
        <linearGradient :id="ids.deck" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stop-color="#D5DBE8" />
          <stop offset="1" stop-color="#8A93AB" />
        </linearGradient>
        <linearGradient :id="ids.desk" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stop-color="#2A3150" />
          <stop offset="1" stop-color="#141932" />
        </linearGradient>
        <linearGradient :id="ids.phones" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stop-color="#EEB05E" />
          <stop offset="1" stop-color="#C67127" />
        </linearGradient>
        <radialGradient :id="ids.bulbHalo">
          <stop offset="0" stop-color="#5BA339" stop-opacity=".9" />
          <stop offset="1" stop-color="#5BA339" stop-opacity="0" />
        </radialGradient>
        <!-- свет экрана, падающий на лицо Ната -->
        <radialGradient :id="ids.screenLight" cx="50%" cy="100%" r="70%">
          <stop offset="0" stop-color="#86ABFA" stop-opacity=".55" />
          <stop offset="1" stop-color="#86ABFA" stop-opacity="0" />
        </radialGradient>
        <filter :id="ids.softGlow" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="3" result="b" />
          <feMerge>
            <feMergeNode in="b" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      <g>
        <g v-for="(seat, index) in SEATS" :key="seat.x" :ref="(el) => setSeatEl(index, el)" class="nat-students__seat">
          <g :transform="`translate(${seat.x} ${BODY_Y}) scale(${SCALE}) translate(-255 -280)`">
            <g class="nat-students__float" :class="{ 'nat-students__float--offbeat': index === 1 }">
              <NatFigure :ref="(figure) => setFigure(index, figure)" :gaze="gazes[index]">
                <template v-if="seat.hasHeadphones" #back>
                  <path d="M104 262 Q100 108 255 104 Q410 108 406 262" fill="none" stroke="#2E3548" stroke-width="14" stroke-linecap="round" />
                  <path d="M110 250 Q108 116 255 112 Q402 116 400 250" fill="none" stroke="#4573F4" stroke-width="3" stroke-opacity=".6" />
                  <rect x="84" y="232" width="36" height="84" rx="16" :fill="`url(#${ids.phones})`" />
                  <rect x="390" y="232" width="36" height="84" rx="16" :fill="`url(#${ids.phones})`" />
                  <rect x="90" y="242" width="8" height="40" rx="4" fill="#fff" opacity=".35" />
                  <rect x="396" y="242" width="8" height="40" rx="4" fill="#fff" opacity=".35" />
                </template>
                <template v-if="!seat.hasHeadphones" #front>
                  <!-- антенна-пружинка с лампочкой вспыхивает, когда приходит сообщение -->
                  <g class="nat-students__antenna">
                    <ellipse cx="255" cy="137" rx="20" ry="7" fill="#2E3548" />
                    <path
                      d="M255 136 L255 128 Q268 124 255 118 Q242 112 255 106 Q268 100 255 94 Q242 88 255 82 L255 74"
                      fill="none"
                      stroke="#A7B0C8"
                      stroke-width="5.5"
                      stroke-linecap="round"
                      stroke-linejoin="round"
                    />
                    <circle class="nat-students__halo" cx="255" cy="60" r="34" :fill="`url(#${ids.bulbHalo})`" />
                    <circle class="nat-students__bulb" cx="255" cy="60" r="17" />
                    <circle cx="249" cy="54" r="5" fill="#fff" opacity=".6" />
                  </g>
                </template>
              </NatFigure>
            </g>
          </g>

          <g :transform="`translate(${seat.x} ${LID_Y})`">
            <ellipse cx="0" cy="-70" rx="120" ry="80" :fill="`url(#${ids.screenLight})`" style="mix-blend-mode: screen" />
            <path d="M-108 -86 H108 Q114 -86 113 -80 L106 0 H-106 L-113 -80 Q-114 -86 -108 -86 Z" :fill="`url(#${ids.lid})`" />
            <path d="M-108 -86 H108" stroke="#fff" stroke-width="2" stroke-linecap="round" opacity=".8" />
            <g transform="translate(0 -44)" fill="none" stroke="#86ABFA" stroke-width="2.2">
              <ellipse rx="16" ry="6" />
              <ellipse rx="16" ry="6" transform="rotate(60)" />
              <ellipse rx="16" ry="6" transform="rotate(-60)" />
              <circle r="3.2" fill="#86ABFA" stroke="none" />
            </g>
            <g v-if="seat.hasHeadphones" class="nat-students__sticker-text">
              <g transform="translate(-70 -60) rotate(-12)">
                <rect x="-20" y="-12" width="40" height="24" rx="6" fill="#4573F4" />
                <text y="6" font-size="14">&lt;/&gt;</text>
              </g>
              <g transform="translate(68 -24) rotate(10)">
                <path d="M0 -14 L4 -4 L15 -4 L6 3 L9 14 L0 7 L-9 14 L-6 3 L-15 -4 L-4 -4 Z" fill="#FFC247" />
              </g>
              <g transform="translate(-60 -22) rotate(8)">
                <circle r="12" fill="#E5484D" />
                <text y="5" font-size="12">A+</text>
              </g>
            </g>
            <g v-else class="nat-students__sticker-text">
              <g transform="translate(66 -60) rotate(12)">
                <circle r="14" fill="#E98D34" />
                <text y="6" font-size="16">π</text>
              </g>
              <g transform="translate(-68 -26) rotate(-10)">
                <path d="M0 12 C-18 0 -14 -14 -6 -14 C-2 -14 0 -10 0 -8 C0 -10 2 -14 6 -14 C14 -14 18 0 0 12 Z" fill="#FF6B9A" />
              </g>
              <g transform="translate(64 -22) rotate(-6)">
                <circle r="13" fill="#5BA339" />
                <path d="M2 -9 L-6 2 H0 L-2 9 L6 -2 H0 Z" fill="#2A5518" />
              </g>
            </g>
            <path d="M-128 0 H128 L120 12 H-120 Z" :fill="`url(#${ids.deck})`" />
            <rect x="-22" y="1" width="44" height="4" rx="2" fill="#6D768F" />
          </g>
        </g>
      </g>

      <rect :x="stage.deskX" y="412" :width="stage.deskWidth" height="14" rx="7" :fill="`url(#${ids.desk})`" />
      <rect :x="stage.deskX" y="412" :width="stage.deskWidth" height="2" rx="1" fill="#4573F4" opacity=".5" />
      <g :filter="`url(#${ids.softGlow})`">
        <text
          v-for="glyph in scene.glyphs"
          :key="glyph.key"
          class="nat-students__glyph"
          :x="glyph.x"
          :y="glyph.y"
          :fill="glyph.color"
          :opacity="glyph.opacity"
        >{{ glyph.text }}</text>
      </g>
      <g>
        <g v-for="bubble in scene.bubbles" :key="bubble.key" :transform="bubble.transform" :opacity="bubble.opacity">
          <rect :x="-bubble.width / 2" y="-16" :width="bubble.width" height="32" rx="16" :fill="bubble.color" />
          <path :d="bubble.tail" :fill="bubble.color" />
          <text class="nat-students__bubble-text" y="6">{{ bubble.text }}</text>
        </g>
      </g>
    </svg>
  </button>
</template>

<script setup lang="ts">
import { onUnmounted, ref, shallowRef, useId, type ComponentPublicInstance } from 'vue'
import { useOffscreenPause } from '../../lib'
import NatFigure from '../NatFigure.vue'
import { aimAt, easeGaze, useSvgPointer, type Point } from '../lib/gaze'
import { useFrameLoop } from '../lib/useFrameLoop'

const props = defineProps<{
  compact?: boolean
}>()

const SEATS = [
  { x: 262, hasHeadphones: true },
  { x: 698, hasHeadphones: false },
]
const SCALE = 0.8
// Сцена и стол; компактная — без пустых краёв, симметрично вокруг двух Натов (центр x 480)
const WIDE_STAGE = { x: 0, width: 960, deskX: 40, deskWidth: 880 }
const COMPACT_STAGE = { x: 88, width: 784, deskX: 98, deskWidth: 764 }
const stage = props.compact ? COMPACT_STAGE : WIDE_STAGE
const BODY_Y = 262
const LID_Y = 412
const GAZE_REACH = 220
// Без курсора Наты смотрят в свои ноутбуки
const LAPTOP_GAZE: Point = { x: 0, y: 0.35 }
const SMILE_MS = 1400
const PING_MS = 700
const TYPING_INTERVAL_S = 0.32
const GLYPH_LIFE_S = 1.6
const GLYPH_RISE_SPEED = 34
const GLYPHS = [
  { items: ['</>', '{ }', '01', 'if', '=>', '✓'], color: '#86ABFA' },
  { items: ['π', 'x²', '∑', '√2', '∞', '+'], color: '#7CC858' },
]
const MESSAGES = [['hi!', 'hey :)'], ['done?', 'yes ✓'], ['2 + 2?', '4!'], ['lunch?', 'sure'], ['gg', 'gg!'], ['help?', 'on it']]
const BUBBLE_COLORS = ['#D2DEFD', '#DBF0D0']
// Облачко целиком (с текстом и хвостиком) крупнее базового размера — чтобы слова читались
const BUBBLE_SCALE = 1.8
const BUBBLE_TAILS = ['M-8 14 L-16 26 L4 14', 'M8 14 L16 26 L-4 14']
const REPLY_DELAY_S = 1.7
const FLIGHT_S = 1.3
const FLIGHT_BASE_Y = 300
const FLIGHT_ARC_HEIGHT = 210
const FIRST_CHAT_S = 4
const CHAT_PAUSE_AFTER_CLICK_S = 8
const MAX_DT_S = 0.05
// Смешок «хи-хи-хи»: у каждого Ната свой голос, второй вступает чуть позже
const GIGGLE_VOICES = [
  { pitchHz: 620, delayS: 0 },
  { pitchHz: 820, delayS: 0.14 },
]
const GIGGLE_SYLLABLES = 4
const GIGGLE_STEP_S = 0.11
const GIGGLE_SYLLABLE_S = 0.08
const GIGGLE_PITCH_DROP = 0.06
const GIGGLE_VOLUME = 0.07
const GIGGLE_FILTER_HZ = 2200

interface Glyph {
  key: number
  text: string
  color: string
  x: number
  y: number
  vx: number
  life: number
}

interface Flight {
  key: number
  from: number
  to: number
  text: string
  time: number
}

const uid = useId()
const ids = {
  lid: `${uid}-lid`,
  deck: `${uid}-deck`,
  desk: `${uid}-desk`,
  phones: `${uid}-phones`,
  bulbHalo: `${uid}-bulb-halo`,
  screenLight: `${uid}-screen-light`,
  softGlow: `${uid}-soft-glow`,
}

const root = ref<HTMLButtonElement | null>(null)
const svg = ref<SVGSVGElement | null>(null)
const { isPaused } = useOffscreenPause(root)
const gazes = ref<Point[]>(SEATS.map(() => LAPTOP_GAZE))
const figures: (InstanceType<typeof NatFigure> | null)[] = []
const seatEls: (SVGGElement | null)[] = []
const pingTimers: ReturnType<typeof setTimeout>[] = []
const delayedPingTimers = new Set<ReturnType<typeof setTimeout>>()

function setFigure(index: number, figure: Element | ComponentPublicInstance | null) {
  figures[index] = figure as InstanceType<typeof NatFigure> | null
}

function setSeatEl(index: number, el: Element | ComponentPublicInstance | null) {
  seatEls[index] = el as SVGGElement | null
}

const heads = SEATS.map((seat) => ({ x: seat.x, y: BODY_Y + 8 * SCALE }))
let focus: Point | null = null

// Летящее сообщение оба Ната провожают взглядом, иначе смотрят на курсор
const getPointer = useSvgPointer(svg)
const gazeLoop = useFrameLoop(() => {
  const pointer = getPointer()
  gazes.value = gazes.value.map((gaze, index) => {
    const target = focus ?? pointer
    const goal = target ? aimAt(heads[index]!, target, GAZE_REACH) : LAPTOP_GAZE
    return easeGaze(gaze, goal, gazeLoop.isReducedMotion())
  })
}, { isAlwaysOn: true })

function smile(index: number) {
  figures[index]?.rejoice(SMILE_MS)
}

// Вспышка антенны (у кого она есть) — когда приходит или уходит сообщение
function ping(index: number) {
  const el = seatEls[index]
  if (!el || SEATS[index]!.hasHeadphones) return
  el.classList.remove('nat-students__seat--ping')
  void el.getBoundingClientRect()
  el.classList.add('nat-students__seat--ping')
  clearTimeout(pingTimers[index])
  pingTimers[index] = setTimeout(() => el.classList.remove('nat-students__seat--ping'), PING_MS)
}

const glyphs: Glyph[] = []
const flights: Flight[] = []
let itemKey = 0
let messageIndex = 0
let typingTime = 0
let untilChat = FIRST_CHAT_S

// Над крышкой ноутбука всплывают значки — каждый учит своё; вылетают у краёв, чтобы не закрывать лицо
function emitGlyph(index: number) {
  const set = GLYPHS[index]!
  const side = Math.random() < 0.5 ? -1 : 1
  glyphs.push({
    key: itemKey++,
    text: set.items[Math.floor(Math.random() * set.items.length)]!,
    color: set.color,
    x: SEATS[index]!.x + side * (88 + Math.random() * 22),
    y: LID_Y - 90,
    vx: side * (8 + Math.random() * 12),
    life: 0,
  })
}

function send(from: number, text: string, delayS = 0) {
  if (delayS) {
    const timer = setTimeout(() => {
      delayedPingTimers.delete(timer)
      ping(from)
    }, delayS * 1000)
    delayedPingTimers.add(timer)
  } else {
    ping(from)
  }
  flights.push({ key: itemKey++, from, to: 1 - from, text, time: -delayS })
}

function chat() {
  const [question, answer] = MESSAGES[messageIndex]!
  messageIndex = (messageIndex + 1) % MESSAGES.length
  send(0, question!)
  send(1, answer!, REPLY_DELAY_S)
}

function stepGlyphs(dt: number) {
  typingTime += dt
  if (typingTime > TYPING_INTERVAL_S) {
    typingTime = 0
    emitGlyph(Math.random() < 0.5 ? 0 : 1)
  }
  for (let k = glyphs.length - 1; k >= 0; k--) {
    const glyph = glyphs[k]!
    glyph.life += dt / GLYPH_LIFE_S
    if (glyph.life >= 1) {
      glyphs.splice(k, 1)
      continue
    }
    glyph.x += glyph.vx * dt
    glyph.y -= GLYPH_RISE_SPEED * dt
  }
}

// Облачко летит по дуге над головами от одного ноутбука к другому, получатель радуется
function stepFlights(dt: number) {
  untilChat -= dt
  if (untilChat <= 0) {
    chat()
    untilChat = 7 + Math.random() * 4
  }
  focus = null
  for (let k = flights.length - 1; k >= 0; k--) {
    const flight = flights[k]!
    flight.time += dt
    if (flight.time < 0) continue
    const progress = Math.min(1, flight.time / FLIGHT_S)
    if (progress < 1) {
      focus = flightPoint(flight)
      continue
    }
    smile(flight.to)
    ping(flight.to)
    flights.splice(k, 1)
  }
}

function flightEase(flight: Flight) {
  const u = Math.min(1, Math.max(0, flight.time) / FLIGHT_S)
  return { u, eased: u * u * (3 - 2 * u) }
}

function flightPoint(flight: Flight): Point {
  const { eased } = flightEase(flight)
  const fromX = SEATS[flight.from]!.x
  const toX = SEATS[flight.to]!.x
  return { x: fromX + (toX - fromX) * eased, y: FLIGHT_BASE_Y - Math.sin(eased * Math.PI) * FLIGHT_ARC_HEIGHT }
}

function calcScene() {
  return {
    glyphs: glyphs.map((glyph) => ({
      key: glyph.key,
      text: glyph.text,
      color: glyph.color,
      x: glyph.x.toFixed(1),
      y: glyph.y.toFixed(1),
      opacity: Math.sin(glyph.life * Math.PI).toFixed(2),
    })),
    bubbles: flights.map((flight) => {
      const { u, eased } = flightEase(flight)
      const point = flightPoint(flight)
      return {
        key: flight.key,
        text: flight.text,
        width: 22 + flight.text.length * 10,
        color: BUBBLE_COLORS[flight.from]!,
        tail: BUBBLE_TAILS[flight.from]!,
        transform: `translate(${point.x.toFixed(1)} ${point.y.toFixed(1)}) scale(${(BUBBLE_SCALE * (0.7 + 0.3 * Math.sin(eased * Math.PI))).toFixed(2)})`,
        opacity: flight.time < 0 ? 0 : Math.min(1, u * 6, (1 - u) * 6 + 0.001).toFixed(2),
      }
    }),
  }
}

const scene = shallowRef(calcScene())

const { requestFrame } = useFrameLoop((rawDt) => {
  const dt = Math.min(rawDt, MAX_DT_S)
  stepGlyphs(dt)
  stepFlights(dt)
  scene.value = calcScene()
})

// Звук только по действию пользователя — сами Наты не шумят
let audio: AudioContext | null = null

function playGiggle() {
  audio ??= new AudioContext()
  const context = audio
  for (const voice of GIGGLE_VOICES) {
    for (let i = 0; i < GIGGLE_SYLLABLES; i++) {
      const start = context.currentTime + voice.delayS + i * GIGGLE_STEP_S
      // Каждый следующий «хи» чуть ниже, а внутри слога тон соскальзывает вниз — так звучит смех
      const pitch = voice.pitchHz * (1 - i * GIGGLE_PITCH_DROP)
      const oscillator = context.createOscillator()
      const filter = context.createBiquadFilter()
      const gain = context.createGain()
      oscillator.type = 'square'
      oscillator.frequency.setValueAtTime(pitch * 1.15, start)
      oscillator.frequency.exponentialRampToValueAtTime(pitch * 0.85, start + GIGGLE_SYLLABLE_S)
      filter.type = 'lowpass'
      filter.frequency.value = GIGGLE_FILTER_HZ
      gain.gain.setValueAtTime(0, start)
      gain.gain.linearRampToValueAtTime(GIGGLE_VOLUME, start + 0.01)
      gain.gain.exponentialRampToValueAtTime(0.001, start + GIGGLE_SYLLABLE_S)
      oscillator.connect(filter).connect(gain).connect(context.destination)
      oscillator.start(start)
      oscillator.stop(start + GIGGLE_SYLLABLE_S + 0.02)
    }
  }
}

onUnmounted(() => {
  void audio?.close()
  delayedPingTimers.forEach(clearTimeout)
  pingTimers.forEach(clearTimeout)
})

// Клик: оба хихикают и подпрыгивают, тут же начинается переписка
function onPress() {
  SEATS.forEach((_, index) => smile(index))
  playGiggle()
  if (!flights.length) {
    chat()
    untilChat = CHAT_PAUSE_AFTER_CLICK_S
  }
  requestFrame()
}
</script>

<style scoped lang="scss">
// Наты здесь уменьшены до 0.8 (SCALE), поэтому сцена шире на 1 / 0.8 — тогда корпус того же размера, что у остальных
.nat-students {
  display: block;
  width: calc(var(--nat-unit) * var(--scene-width) / 0.8);
  max-width: 100%;
  padding: 0;
  border: 0;
  background: none;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;

  &:focus-visible {
    outline: 2px solid var(--color-blue);
    outline-offset: 8px;
    border-radius: 24px;
  }

  // За экраном CSS-анимации сцены стоят на паузе
  &--paused,
  &--paused :deep(*) {
    animation-play-state: paused !important;
  }

  &__svg {
    display: block;
    width: 100%;
    height: auto;
    overflow: visible;
  }

  &__float {
    transform-box: fill-box;
    transform-origin: 50% 60%;
    animation: nat-students-float 3.2s ease-in-out infinite alternate;

    &--offbeat {
      animation-duration: 3.6s;
      animation-delay: -1.4s;
    }
  }

  &__sticker-text text {
    font-family: var(--font-body);
    font-weight: 700;
    fill: #fff;
    text-anchor: middle;
  }

  &__glyph,
  &__bubble-text {
    font-family: var(--font-body);
    font-size: 17px;
    font-weight: 700;
    text-anchor: middle;
  }

  &__bubble-text {
    fill: #1a2140;
  }

  &__antenna {
    transform-box: fill-box;
    transform-origin: 50% 96%;
    animation: nat-students-sway 1.6s ease-in-out infinite alternate;
  }

  &__halo {
    opacity: 0.35;
    animation: nat-students-glow 2.4s ease-in-out infinite alternate;
    transition: opacity 0.2s;
  }

  &__bulb {
    fill: #5ba339;
    transition: fill 0.2s;
  }

  &__seat--ping &__halo {
    animation: none;
    opacity: 1;
  }

  &__seat--ping &__bulb {
    fill: #f5ffef;
  }

  &__seat--ping &__antenna {
    animation: nat-students-boing 0.5s cubic-bezier(0.3, 1.8, 0.5, 1);
  }
}

@keyframes nat-students-float {
  from {
    transform: translateY(5px) rotate(1.5deg);
  }

  to {
    transform: translateY(-9px) rotate(-2deg);
  }
}

@keyframes nat-students-sway {
  from {
    transform: rotate(-7deg);
  }

  to {
    transform: rotate(7deg);
  }
}

@keyframes nat-students-glow {
  to {
    opacity: 0.6;
  }
}

@keyframes nat-students-boing {
  30% {
    transform: rotate(-14deg) scaleY(1.08);
  }

  65% {
    transform: rotate(10deg);
  }
}

@media (prefers-reduced-motion: reduce) {
  .nat-students__float,
  .nat-students__antenna,
  .nat-students__halo {
    animation: none;
  }
}
</style>
