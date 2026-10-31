<template>
  <NatRobot ref="robot" label="Нат собирает задание. Нажми, чтобы он поздоровался" :view-box="layout.viewBox" @press="onPress">
    <template #defs>
      <!-- У каждой карточки свой цвет бренда: оттенок стекла, тень и плашка с иконкой -->
      <linearGradient v-for="accent in ACCENTS" :id="ids.glass[accent.name]" :key="`glass-${accent.name}`" x1="0" y1="0" x2="0.4" y2="1">
        <stop offset="0" stop-color="#FFFFFF" stop-opacity=".85" />
        <stop offset="1" :stop-color="accent.glass" stop-opacity=".92" />
      </linearGradient>
      <filter v-for="accent in ACCENTS" :id="ids.shadow[accent.name]" :key="`shadow-${accent.name}`" x="-30%" y="-30%" width="160%" height="170%">
        <feDropShadow dx="0" dy="10" stdDeviation="12" :flood-color="accent.base" flood-opacity=".22" />
      </filter>
      <linearGradient v-for="accent in ACCENTS" :id="ids.tile[accent.name]" :key="`tile-${accent.name}`" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" :stop-color="accent.light" />
        <stop offset="1" :stop-color="accent.base" />
      </linearGradient>
      <radialGradient :id="ids.antBall" cx="35%" cy="30%" r="75%">
        <stop offset="0" stop-color="#C3D3FC" />
        <stop offset=".45" stop-color="#4573F4" />
        <stop offset="1" stop-color="#2246BC" />
      </radialGradient>
      <radialGradient :id="ids.antHalo">
        <stop offset="0" stop-color="#4573F4" stop-opacity=".8" />
        <stop offset="1" stop-color="#4573F4" stop-opacity="0" />
      </radialGradient>
    </template>

    <template #back>
      <g :transform="`rotate(${(antenna.angle * RAD_TO_DEG).toFixed(2)} 255 137)`">
        <NatAntennaCap />
        <path :d="antenna.springPath" fill="none" stroke="#A7B0C8" stroke-width="5" stroke-linecap="round" />
        <NatAntennaBall :cx="255" :cy="antenna.ballY" :radius="ANTENNA_BALL_RADIUS" :flash="antenna.flash" :ball-id="ids.antBall" :halo-id="ids.antHalo" />
      </g>
    </template>

    <template #front>
      <!-- Карточка с картинкой: «добавить задание» -->
      <g v-if="cards[0]!.opacity > 0" :transform="cards[0]!.transform" :opacity="cards[0]!.opacity" data-testid="nat-card">
        <rect :width="CARDS[0]!.w" :height="CARDS[0]!.h" rx="22" :fill="`url(#${ids.glass.blue})`" stroke="#fff" stroke-width="2" :filter="`url(#${ids.shadow.blue})`" />
        <rect x="16" y="16" width="60" height="60" rx="16" :fill="`url(#${ids.tile.blue})`" />
        <path d="M27 64 L41 46 L51 57 L58 50 L66 64 Z" fill="#fff" />
        <circle cx="60" cy="33" r="6" fill="#fff" />
        <rect x="92" y="28" width="70" height="10" rx="5" fill="#C7D4F4" />
        <rect x="92" y="48" width="50" height="10" rx="5" fill="#DCE5F9" />
        <g transform="translate(184 46)">
          <circle r="18" :fill="`url(#${ids.tile.green})`" />
          <path d="M0 -8 V8 M-8 0 H8" stroke="#fff" stroke-width="5" stroke-linecap="round" />
        </g>
      </g>

      <!-- Карточка-вопрос -->
      <g v-if="cards[1]!.opacity > 0" :transform="cards[1]!.transform" :opacity="cards[1]!.opacity" data-testid="nat-card">
        <rect :width="CARDS[1]!.w" :height="CARDS[1]!.h" rx="22" :fill="`url(#${ids.glass.orange})`" stroke="#fff" stroke-width="2" :filter="`url(#${ids.shadow.orange})`" />
        <rect x="16" y="14" width="58" height="58" rx="16" :fill="`url(#${ids.tile.orange})`" />
        <path d="M37 35 Q37 25 45 25 Q54 25 54 34 Q54 40 46 43 V48" fill="none" stroke="#fff" stroke-width="6" stroke-linecap="round" stroke-linejoin="round" />
        <circle cx="46" cy="58" r="4" fill="#fff" />
        <rect x="90" y="24" width="96" height="10" rx="5" fill="#F6D2A8" />
        <rect x="90" y="44" width="70" height="10" rx="5" fill="#FAE4CB" />
      </g>

      <!-- Карточка сопоставления: пары соединяются по одной -->
      <g v-if="cards[2]!.opacity > 0" :transform="cards[2]!.transform" :opacity="cards[2]!.opacity" data-testid="nat-card">
        <rect :width="CARDS[2]!.w" :height="CARDS[2]!.h" rx="22" :fill="`url(#${ids.glass.green})`" stroke="#fff" stroke-width="2" :filter="`url(#${ids.shadow.green})`" />
        <g v-for="(match, k) in MATCHES" :key="match.number" :transform="`translate(0 ${30 + k * 42})`">
          <circle cx="28" r="13" fill="#E3EAFC" />
          <text x="28" class="nat-cards__letter">{{ match.number }}</text>
          <line x1="44" x2="72" stroke="#5BA339" stroke-width="3" stroke-linecap="round" :stroke-dasharray="PAIR_LINE" :stroke-dashoffset="cards[2]!.pairOffsets[k]" />
          <circle cx="88" r="13" fill="#FCE9D4" />
          <text x="88" class="nat-cards__letter nat-cards__letter--orange">{{ match.letter }}</text>
          <rect x="110" y="-5" width="44" height="10" rx="5" fill="#CFE6C2" />
        </g>
      </g>

      <!-- Карточка-ссылка: ученикам отправлено -->
      <g v-if="cards[3]!.opacity > 0" :transform="cards[3]!.transform" :opacity="cards[3]!.opacity" data-testid="nat-card">
        <rect :width="CARDS[3]!.w" :height="CARDS[3]!.h" rx="22" :fill="`url(#${ids.glass.navy})`" stroke="#fff" stroke-width="2" :filter="`url(#${ids.shadow.navy})`" />
        <rect x="16" y="16" width="60" height="60" rx="16" :fill="`url(#${ids.tile.navy})`" />
        <g transform="translate(46 46) rotate(-45)" fill="none" stroke="#fff" stroke-width="6" stroke-linecap="round">
          <rect x="-22" y="-8" width="24" height="16" rx="8" />
          <rect x="-2" y="-8" width="24" height="16" rx="8" />
        </g>
        <rect x="92" y="28" width="76" height="10" rx="5" fill="#C7D4F4" />
        <rect x="92" y="48" width="54" height="10" rx="5" fill="#DCE5F9" />
        <g :transform="`translate(194 46) scale(${cards[3]!.checkScale.toFixed(3)})`">
          <circle r="18" :fill="`url(#${ids.tile.green})`" />
          <path d="M-8 0 L-2 6 L8 -6" fill="none" stroke="#fff" stroke-width="5" stroke-linecap="round" stroke-linejoin="round" />
        </g>
      </g>

      <!-- Карточка оценки: процент правильных ответов заполняется, выскакивает оценка -->
      <g v-if="cards[4]!.opacity > 0" :transform="cards[4]!.transform" :opacity="cards[4]!.opacity" data-testid="nat-card">
        <rect :width="CARDS[4]!.w" :height="CARDS[4]!.h" rx="22" :fill="`url(#${ids.glass.green})`" stroke="#fff" stroke-width="2" :filter="`url(#${ids.shadow.green})`" />
        <rect x="16" y="18" width="60" height="60" rx="16" :fill="`url(#${ids.tile.green})`" />
        <rect x="29" y="52" width="9" height="14" rx="4" fill="#fff" />
        <rect x="42" y="43" width="9" height="23" rx="4" fill="#fff" />
        <rect x="55" y="32" width="9" height="34" rx="4" fill="#fff" />
        <rect x="92" y="30" :width="GRADE_TRACK" height="10" rx="5" fill="#E1F0D8" />
        <rect x="92" y="30" :width="cards[4]!.scoreWidth" height="10" rx="5" fill="#5BA339" />
        <rect x="92" y="54" width="46" height="10" rx="5" fill="#CFE6C2" />
        <g :transform="`translate(190 48) scale(${cards[4]!.gradeScale.toFixed(3)})`">
          <circle r="22" :fill="`url(#${ids.tile.orange})`" />
          <text class="nat-cards__grade" :class="{ 'nat-cards__grade--long': GRADES[gradeIndex]!.length > 2 }">{{ GRADES[gradeIndex] }}</text>
        </g>
      </g>

      <!-- Карточка-видео: полоска просмотра заполняется -->
      <g v-if="cards[5]!.opacity > 0" :transform="cards[5]!.transform" :opacity="cards[5]!.opacity" data-testid="nat-card">
        <rect :width="CARDS[5]!.w" :height="CARDS[5]!.h" rx="22" :fill="`url(#${ids.glass.orange})`" stroke="#fff" stroke-width="2" :filter="`url(#${ids.shadow.orange})`" />
        <rect x="16" y="16" width="60" height="60" rx="16" :fill="`url(#${ids.tile.orange})`" />
        <path d="M39 33 L59 46 L39 59 Z" fill="#fff" stroke="#fff" stroke-width="4" stroke-linejoin="round" />
        <rect x="92" y="30" :width="VIDEO_TRACK" height="10" rx="5" fill="#FAE4CB" />
        <rect x="92" y="30" :width="cards[5]!.videoWidth" height="10" rx="5" fill="#E98D34" />
        <rect x="92" y="52" width="56" height="10" rx="5" fill="#F6D2A8" />
      </g>

      <!-- Приветствие по нажатию: карточки прячутся, облачко справа от Ната, хвостик тянется к лицу -->
      <g :transform="`translate(${layout.bubble.x} ${layout.bubble.y})`">
        <g class="nat-cards__bubble" :class="{ 'nat-cards__bubble--visible': isGreeting }">
          <path :d="BUBBLE_PATH" fill="#fff" stroke="#DCE5F9" stroke-width="2" :filter="`url(#${ids.shadow.blue})`" />
          <text x="26" y="48" class="nat-cards__greeting" :style="{ fontSize: `${layout.bubble.fontSize}px` }">
            <tspan class="nat-cards__greeting-name">Hi! I'm Nat.</tspan>
            <tspan x="26" dy="40">Let's create your</tspan>
            <tspan x="26" dy="36">first activity!</tspan>
          </text>
        </g>
      </g>
    </template>
  </NatRobot>
</template>

<script setup lang="ts">
import { onBeforeUnmount, ref, shallowRef, useId } from 'vue'
import NatRobot from '../NatRobot.vue'
import NatAntennaBall from '../parts/NatAntennaBall.vue'
import NatAntennaCap from '../parts/NatAntennaCap.vue'
import { createSpring, idleSway, kickSpring, MAX_SPRING_DT_S, RAD_TO_DEG, stepSpring, zigzag } from '../lib/spring'
import { useFrameLoop } from '../lib/useFrameLoop'

// Цикл: карточки по очереди вылетают из Ната, пары соединяются, на ссылке ставится галочка,
// процент заполняется и выскакивает оценка — Нат радуется, задание висит собранным,
// потом карточки тают и всё начинается заново
const CYCLE_S = 12
const APPEAR_S = 0.6
const PAIR_DELAY_S = 0.6
const PAIR_STEP_S = 0.3
const PAIR_DRAW_S = 0.25
const CHECK_DELAY_S = 0.7
const CHECK_POP_S = 0.3
const FADE_START_S = 10.4
const FADE_S = 0.6
// Кадр, который показываем при prefers-reduced-motion: задание уже собрано
const ASSEMBLED_AT_S = 9.6
const JOY_MS = 1500
const GREETING_MS = 4500
const HIDE_S = 0.25
const MAX_DT_S = 0.05

const NAT_CENTER = { x: 255, y: 285 }
const ANTENNA_HEIGHT = 62
const ANTENNA_BALL_RADIUS = 17

const MATCHES = [
  { number: '1', letter: 'a' },
  { number: '2', letter: 'b' },
  { number: '3', letter: 'c' },
  { number: '4', letter: 'd' },
]
const PAIR_LINE = 28

const props = defineProps<{
  // Для узких экранов: карточки над и под Натом, а не по бокам — сцена уже и выше, всё крупнее
  compact?: boolean
}>()

interface CardLayout {
  x: number
  y: number
  w: number
  h: number
  start: number
  phase: number
}

interface SceneLayout {
  viewBox: string
  // Облачко приветствия: левый верхний угол, ширина, размер шрифта и кончик хвостика (в координатах сцены)
  bubble: { x: number, y: number, w: number, fontSize: number, tip: { x: number, y: number } }
  // Карточки в компактной сцене мельче, чтобы стоять сбоку от Ната и не закрывать его
  cardScale: number
  positions: { x: number, y: number }[]
}

// Порядок карточек в массивах: картинка, вопрос, сопоставление, ссылка, оценка, видео
// Появляются по смыслу: материалы (картинка, видео) → вопрос → сопоставление → ссылка → оценка
const CARD_SPECS = [
  { w: 214, h: 92, start: 0.8, phase: 0 },
  { w: 206, h: 86, start: 2.8, phase: 1.7 },
  { w: 170, h: 196, start: 3.8, phase: 3.1 },
  { w: 224, h: 92, start: 5.8, phase: 4.4 },
  { w: 220, h: 96, start: 7, phase: 2.4 },
  { w: 200, h: 92, start: 1.8, phase: 5.6 },
]

const WIDE_LAYOUT: SceneLayout = {
  viewBox: '-175 -45 850 600',
  bubble: { x: 335, y: 40, w: 330, fontSize: 30, tip: { x: 348, y: 322 } },
  cardScale: 1,
  positions: [{ x: -160, y: 50 }, { x: 330, y: -30 }, { x: 465, y: 95 }, { x: 300, y: 420 }, { x: -165, y: 330 }, { x: -150, y: 196 }],
}

// Карточки двумя дугами по бокам от Ната, не заходя на его корпус: верхние и нижние ближе к Нату,
// там шар уже, средние дальше. Сцена низкая,
// и на первом экране телефона под ней помещаются пункты и кнопка. Сцена симметрична относительно Ната (x 255)
const COMPACT_LAYOUT: SceneLayout = {
  viewBox: '-95 30 700 450',
  bubble: { x: 284, y: 20, w: 288, fontSize: 27, tip: { x: 348, y: 322 } },
  cardScale: 0.85,
  positions: [{ x: -62, y: 44 }, { x: 362, y: 40 }, { x: 400, y: 150 }, { x: 363, y: 370 }, { x: -98, y: 300 }, { x: -90, y: 172 }],
}

const layout = props.compact ? COMPACT_LAYOUT : WIDE_LAYOUT

const BUBBLE_HEIGHT = 142
const BUBBLE_RADIUS = 24
const BUBBLE_TAIL_BASE = { from: 60, to: 104 }

// Хвостик выходит из нижнего края облачка и упирается в низ лица Ната, где был бы рот — будто Нат говорит
function buildBubblePath({ x, y, w, tip }: SceneLayout['bubble']) {
  const h = BUBBLE_HEIGHT
  const r = BUBBLE_RADIUS
  const tipX = tip.x - x
  const tipY = tip.y - y
  return [
    `M${r} 0 H${w - r} A${r} ${r} 0 0 1 ${w} ${r} V${h - r} A${r} ${r} 0 0 1 ${w - r} ${h}`,
    `H${BUBBLE_TAIL_BASE.to} L${tipX} ${tipY} L${BUBBLE_TAIL_BASE.from} ${h}`,
    `H${r} A${r} ${r} 0 0 1 0 ${h - r} V${r} A${r} ${r} 0 0 1 ${r} 0 Z`,
  ].join(' ')
}

const BUBBLE_PATH = buildBubblePath(layout.bubble)
const CARDS: CardLayout[] = CARD_SPECS.map((spec, k) => ({ ...spec, ...layout.positions[k]! }))
const CHECK_AT_S = CARDS[3]!.start + CHECK_DELAY_S

// В каждом цикле оценка по другой шкале — намёк, что шкалу выбирает учитель
const GRADES = ['100', 'A', '10']
const GRADE_TRACK = 72
const SCORE_SHARE = 0.92
const SCORE_DELAY_S = 0.5
const SCORE_FILL_S = 0.7
const GRADE_POP_S = 0.3
const GRADE_AT_S = CARDS[4]!.start + SCORE_DELAY_S + SCORE_FILL_S

const VIDEO_TRACK = 86
const VIDEO_PLAY_S = 4
const FLOAT_AMPLITUDE = 6
const FLOAT_RATE = 1.6

// Цвета бренда: base — основной, light — светлее (верх плашки), glass — оттенок стекла карточки
const ACCENTS = [
  { name: 'blue', base: '#4573F4', light: '#93B0F9', glass: '#D6E1FC' },
  { name: 'navy', base: '#2549C5', light: '#4573F4', glass: '#D6E1FC' },
  { name: 'green', base: '#5BA339', light: '#7CC858', glass: '#D9EDCE' },
  { name: 'orange', base: '#E98D34', light: '#EEB05E', glass: '#FBE1C4' },
] as const

type AccentName = typeof ACCENTS[number]['name']

function idsByAccent(prefix: string) {
  return Object.fromEntries(ACCENTS.map(({ name }) => [name, `${uid}-${prefix}-${name}`])) as Record<AccentName, string>
}

const uid = useId()
const ids = {
  glass: idsByAccent('glass'),
  shadow: idsByAccent('shadow'),
  tile: idsByAccent('tile'),
  antBall: `${uid}-ant-ball`,
  antHalo: `${uid}-ant-halo`,
}

const robot = ref<InstanceType<typeof NatRobot> | null>(null)

function clamp01(value: number) {
  return Math.min(1, Math.max(0, value))
}

function easeOutCubic(t: number) {
  return 1 - Math.pow(1 - t, 3)
}

// Лёгкий перелёт за конечный размер — карточка «выпрыгивает»
function easeOutBack(t: number) {
  const overshoot = 1.7
  return 1 + (overshoot + 1) * Math.pow(t - 1, 3) + overshoot * Math.pow(t - 1, 2)
}

let cycle = 0
// 0 — карточки на месте, 1 — спрятаны на время приветствия
let hidden = 0
const gradeIndex = ref(0)
let clock = 0
let antennaTime = 0
const spring = createSpring()

function calcCard(card: CardLayout) {
  const appear = clamp01((cycle - card.start) / APPEAR_S)
  const fade = clamp01((cycle - FADE_START_S) / FADE_S)
  const fly = easeOutCubic(appear)
  const centerX = card.x + card.w / 2
  const centerY = card.y + card.h / 2
  const x = NAT_CENTER.x + (centerX - NAT_CENTER.x) * fly
  const y = NAT_CENTER.y + (centerY - NAT_CENTER.y) * fly + Math.sin(clock * FLOAT_RATE + card.phase) * FLOAT_AMPLITUDE - fade * 20
  const scale = (0.2 + 0.8 * easeOutBack(appear)) * layout.cardScale
  return {
    transform: `translate(${x.toFixed(1)} ${y.toFixed(1)}) scale(${scale.toFixed(3)}) translate(${-card.w / 2} ${-card.h / 2})`,
    opacity: Number((clamp01(appear * 2) * (1 - fade) * (1 - hidden)).toFixed(3)),
    pairOffsets: MATCHES.map((_, k) => {
      const draw = clamp01((cycle - card.start - PAIR_DELAY_S - k * PAIR_STEP_S) / PAIR_DRAW_S)
      return (PAIR_LINE * (1 - draw)).toFixed(1)
    }),
    checkScale: easeOutBack(clamp01((cycle - CHECK_AT_S) / CHECK_POP_S)),
    scoreWidth: (GRADE_TRACK * SCORE_SHARE * easeOutCubic(clamp01((cycle - CARDS[4]!.start - SCORE_DELAY_S) / SCORE_FILL_S))).toFixed(1),
    gradeScale: easeOutBack(clamp01((cycle - GRADE_AT_S) / GRADE_POP_S)),
    videoWidth: (VIDEO_TRACK * clamp01((cycle - CARDS[5]!.start - APPEAR_S) / VIDEO_PLAY_S)).toFixed(1),
  }
}

function calcAntenna() {
  const top = 136 - ANTENNA_HEIGHT * spring.stretch
  return {
    angle: spring.angle,
    flash: spring.flash,
    springPath: zigzag(255, 136, top, 5, 12),
    ballY: top - 16,
  }
}

function celebrate() {
  kickSpring(spring)
  spring.flash = 1
}

const cards = shallowRef(CARDS.map(calcCard))
const antenna = shallowRef(calcAntenna())

const { requestFrame, isReducedMotion } = useFrameLoop((rawDt) => {
  // Первый кадр бывает с отрицательным dt (метка rAF раньше старта) — иначе цикл «отмотается» и сменит оценку
  const dt = Math.min(Math.max(rawDt, 0), MAX_DT_S)
  if (isGreeting.value) {
    hidden = isReducedMotion() ? 1 : Math.min(1, hidden + dt / HIDE_S)
  }
  else if (isReducedMotion()) {
    cycle = ASSEMBLED_AT_S
  }
  else {
    const previous = cycle
    cycle = (cycle + dt) % CYCLE_S
    clock += dt
    if (cycle < previous) gradeIndex.value = (gradeIndex.value + 1) % GRADES.length
    if (previous < GRADE_AT_S && cycle >= GRADE_AT_S) {
      robot.value?.rejoice(JOY_MS)
      celebrate()
    }
  }
  const antennaDt = Math.min(rawDt, MAX_SPRING_DT_S)
  antennaTime += antennaDt
  stepSpring(spring, antennaDt, idleSway(antennaTime))
  cards.value = CARDS.map(calcCard)
  antenna.value = calcAntenna()
})

const isGreeting = ref(false)
let greetingTimer: ReturnType<typeof setTimeout> | undefined

// После приветствия задание собирается заново, с первой карточки и новой оценкой
function finishGreeting() {
  isGreeting.value = false
  hidden = 0
  cycle = 0
  gradeIndex.value = (gradeIndex.value + 1) % GRADES.length
  requestFrame()
}

// Повторное нажатие продлевает приветствие на полный срок
function greet() {
  isGreeting.value = true
  clearTimeout(greetingTimer)
  greetingTimer = setTimeout(finishGreeting, GREETING_MS)
}

function onPress() {
  celebrate()
  greet()
  requestFrame()
}

onBeforeUnmount(() => clearTimeout(greetingTimer))
</script>

<style scoped lang="scss">
// Облачко растёт из хвостика, который смотрит на Ната
.nat-cards__bubble {
  opacity: 0;
  transform: scale(0.6);
  transform-box: fill-box;
  // Низ рамки — это кончик хвостика у лица Ната: облачко «вылетает» из него
  transform-origin: 35% 100%;
  transition:
    opacity 0.2s ease,
    transform 0.3s cubic-bezier(0.3, 1.6, 0.5, 1);
}

.nat-cards__bubble--visible {
  opacity: 1;
  transform: scale(1);
}

.nat-cards__greeting {
  fill: #1a2140;
  font-family: var(--font-body);
  font-size: 30px;
  font-weight: 500;
}

.nat-cards__greeting-name {
  fill: #4573f4;
  font-family: var(--font-display);
  font-weight: 700;
}

@media (prefers-reduced-motion: reduce) {
  .nat-cards__bubble {
    transition: none;
  }
}

.nat-cards__grade {
  fill: #fff;
  font-family: var(--font-display);
  font-size: 20px;
  font-weight: 700;
  text-anchor: middle;
  dominant-baseline: central;
}

.nat-cards__grade--long {
  font-size: 15px;
}

.nat-cards__letter {
  fill: #2549c5;
  font-family: var(--font-body);
  font-size: 14px;
  font-weight: 700;
  text-anchor: middle;
  dominant-baseline: central;
}

.nat-cards__letter--orange {
  fill: #c67127;
}
</style>
