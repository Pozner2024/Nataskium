<template>
  <NatRobot
    class="nat-teacher"
    label="Нат-учитель у интерактивной доски с вопросом. Нажми, чтобы открыть ответ"
    view-box="-260 40 880 430"
    follows-cursor
    @press="onPress"
  >
    <template #defs>
      <linearGradient :id="ids.screen" x1="0" y1="0" x2=".3" y2="1">
        <stop offset="0" stop-color="#FFFFFF" />
        <stop offset="1" stop-color="#E4EAF6" />
      </linearGradient>
      <linearGradient :id="ids.bezel" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#4A5269" />
        <stop offset="1" stop-color="#22283A" />
      </linearGradient>
      <linearGradient :id="ids.gloss" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="#fff" stop-opacity="0" />
        <stop offset=".45" stop-color="#fff" stop-opacity="0" />
        <stop offset=".5" stop-color="#fff" stop-opacity=".55" />
        <stop offset=".62" stop-color="#fff" stop-opacity="0" />
      </linearGradient>
      <linearGradient :id="ids.capTop" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="#3A4470" />
        <stop offset="1" stop-color="#161B33" />
      </linearGradient>
      <clipPath :id="ids.screenClip" clipPathUnits="userSpaceOnUse"><rect x="-232" y="100" width="284" height="262" rx="5" /></clipPath>
    </template>

    <template #scene>
      <g>
        <rect x="-246" y="86" width="312" height="300" rx="16" :fill="`url(#${ids.bezel})`" />
        <rect x="-232" y="100" width="284" height="262" rx="5" :fill="`url(#${ids.screen})`" />
        <rect x="-232" y="100" width="284" height="262" rx="5" :fill="`url(#${ids.gloss})`" opacity=".5" />
        <circle cx="-90" cy="93" r="2.6" fill="#0E1220" />
        <circle cx="54" cy="377" r="2.6" fill="#4FA3FF" />
        <rect x="-226" y="370" width="200" height="10" rx="5" fill="#2E3548" />
        <rect x="-212" y="368" width="40" height="8" rx="4" fill="#4573F4" />
        <rect x="-166" y="368" width="40" height="8" rx="4" fill="#5BA339" />
        <rect x="-120" y="368" width="40" height="8" rx="4" fill="#E98D34" />
        <g :clip-path="`url(#${ids.screenClip})`">
          <g :opacity="board.cardOpacity">
            <g transform="translate(-208 122)">
              <rect x="-12" y="-12" width="24" height="24" rx="7" fill="#1A2140" />
              <NatQuizTypeIcon :type="question.type" />
            </g>
            <!-- в одну строку: пробелы внутри <text> сдвинули бы вопрос от центра -->
            <text class="nat-teacher__question" :x="CARD_X" y="176">{{ questionParts[0] }}<tspan v-if="questionParts.length > 1" fill="#4573F4">_____</tspan>{{ questionParts[1] }}</text>
            <g
              v-for="tile in board.tiles"
              :key="tile.key"
              class="nat-teacher__tile"
              :class="{ 'nat-teacher__tile--correct': tile.isCorrect }"
              :transform="tile.transform"
              :opacity="tile.opacity"
              :style="tile.style"
            >
              <rect class="nat-teacher__tile-bg" :width="tile.width" :height="tile.height" rx="12" />
              <rect class="nat-teacher__tile-base" x="8" :y="tile.height - 5" :width="tile.width - 16" height="3" rx="1.5" />
              <g v-if="question.type === 'picture'" class="nat-teacher__ink" :transform="`translate(${tile.width / 2} ${tile.height / 2})`">
                <NatQuizShape :shape="tile.label" />
              </g>
              <template v-else-if="question.type === 'truefalse'">
                <g :transform="`translate(${tile.width / 2 + 18} ${tile.height / 2 - 16})`">
                  <path
                    v-if="tile.key === 0"
                    class="nat-teacher__ink-stroke"
                    d="M-26 0 L-20 6 L-10 -6"
                    fill="none"
                    stroke-width="4"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                  />
                  <path v-else class="nat-teacher__ink-stroke" d="M-25 -6 L-13 6 M-13 -6 L-25 6" stroke-width="4" stroke-linecap="round" />
                </g>
                <text class="nat-teacher__option nat-teacher__ink" :x="tile.width / 2" :y="tile.height / 2 + 22">{{ tile.label }}</text>
              </template>
              <text v-else class="nat-teacher__option nat-teacher__ink" :x="tile.width / 2" :y="tile.height / 2 + 1">{{ tile.label }}</text>
              <g :transform="`translate(${tile.width - 14} 14)`" :opacity="tile.isCorrect ? 1 : 0">
                <circle r="11" fill="#fff" />
                <path d="M-5 0 L-1.5 4 L5.5 -4" fill="none" stroke="#5BA339" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" />
              </g>
            </g>
          </g>
          <g :opacity="board.cardOpacity">
            <circle
              v-for="(_, index) in QUESTIONS"
              :key="index"
              :cx="-30 + index * 14"
              cy="122"
              :r="index === questionIndex ? 4.5 : 3.5"
              :fill="index < questionIndex ? '#5BA339' : index === questionIndex ? '#4573F4' : '#C9D1E3'"
            />
          </g>
          <rect x="-220" y="340" width="260" height="7" rx="3.5" fill="#DCE2EF" />
          <rect x="-220" y="340" :width="board.timerWidth ?? undefined" height="7" rx="3.5" fill="#4573F4" />
          <g>
            <rect v-for="piece in board.confetti" :key="piece.key" width="5" height="3" rx="1" :fill="piece.color" :transform="piece.transform" :opacity="piece.opacity" />
          </g>
        </g>
      </g>
    </template>

    <template #back>
      <g class="nat-teacher__stylus" :class="{ 'nat-teacher__stylus--picking': isPicking }">
        <line x1="118" y1="372" x2="-4" y2="256" stroke="#2E3548" stroke-width="10" stroke-linecap="round" />
        <line x1="112" y1="364" x2="20" y2="277" stroke="#8C96B0" stroke-width="3" stroke-linecap="round" opacity=".6" />
        <line x1="10" y1="267" x2="-4" y2="256" stroke="#4573F4" stroke-width="10" stroke-linecap="round" />
        <circle cx="-10" cy="250" r="5" fill="#86ABFA" />
      </g>
    </template>

    <template #glasses>
      <g fill="none" stroke="#FFD27A" stroke-width="3.6">
        <circle cx="261" cy="279" r="33" />
        <circle cx="329" cy="279" r="33" />
        <path d="M293 275 Q295 268 297 275" stroke-width="3" />
        <path d="M228 273 L208 264 M362 273 L380 264" stroke-opacity=".7" />
        <ellipse cx="250" cy="265" rx="11" ry="5" fill="#fff" fill-opacity=".18" stroke="none" />
        <ellipse cx="318" cy="265" rx="11" ry="5" fill="#fff" fill-opacity=".18" stroke="none" />
      </g>
    </template>

    <template #front>
      <path d="M180 150 Q255 112 330 150 L322 176 Q255 146 188 176 Z" fill="#232A4D" />
      <path d="M255 76 L382 112 L255 148 L128 112 Z" :fill="`url(#${ids.capTop})`" />
      <path d="M128 112 L255 148 L382 112" fill="none" stroke="#4573F4" stroke-opacity=".5" stroke-width="2" />
      <circle cx="255" cy="112" r="6" fill="#FFC247" />
      <path d="M255 112 L352 112" stroke="#FFC247" stroke-width="3" />
      <g class="nat-teacher__tassel">
        <path d="M352 112 L352 168" stroke="#FFC247" stroke-width="3" />
        <path d="M344 166 L360 166 L364 196 L340 196 Z" fill="#FFC247" />
        <path d="M346 172 L346 196 M352 172 L352 196 M358 172 L358 196" stroke="#D99A22" stroke-width="1.5" />
      </g>
    </template>
  </NatRobot>
</template>

<script setup lang="ts">
import { computed, ref, shallowRef, useId } from 'vue'
import NatRobot from '../NatRobot.vue'
import NatQuizShape from '../parts/NatQuizShape.vue'
import NatQuizTypeIcon from '../parts/NatQuizTypeIcon.vue'
import type { QuizQuestion } from '../parts/quiz'
import { useFrameLoop } from '../lib/useFrameLoop'

// Нат показывает, какие вопросы можно собрать на платформе. На доске только латиница, цифры и знаки
const QUESTIONS: QuizQuestion[] = [
  { type: 'choice', text: '5 × 4 = ?', options: ['20', '9', '25', '16'], answer: 0 },
  { type: 'truefalse', text: 'H₂O is water', options: ['true', 'false'], answer: 0 },
  { type: 'picture', text: 'Find the triangle', options: ['circle', 'triangle', 'square', 'star'], answer: 1 },
  { type: 'gap', text: 'Hello, ___ are you?', options: ['how', 'who', 'what', 'why'], answer: 0 },
  { type: 'choice', text: 'a² + b² = ?', options: ['ab', '2ab', 'c²', 'a + b'], answer: 2 },
]
// base — цвет бренда, tint — мягкая заливка плитки, ink — текст и значки на ней
const TONES = [
  { base: '#4573F4', tint: '#E6EDFE', ink: '#2549C5' },
  { base: '#E98D34', tint: '#FCEEDF', ink: '#97541B' },
  { base: '#5BA339', tint: '#E6F4DF', ink: '#3D7326' },
  { base: '#4A5160', tint: '#ECEEF3', ink: '#3B404C' },
] as const
const TRUE_TONE = TONES[2]
const FALSE_TONE = TONES[1]
const CONFETTI_COLORS = TONES.slice(0, 3).map((tone) => tone.base)
const CONFETTI_COUNT = 26
const CONFETTI_LIFE_S = 1.4
const GRAVITY = 260
const ASK_S = 3.2
const PICK_S = 0.8
const REVEAL_S = 2.2
const OUT_S = 0.45
const CARD_X = -90
const TIMER_WIDTH = 260
const TILE_WIDTH = 124
const MAX_DT_S = 0.05
const SPEED_EASING = 0.03

type Phase = 'ask' | 'pick' | 'reveal' | 'out'

interface Confetti {
  key: number
  x: number
  y: number
  vx: number
  vy: number
  spin: number
  life: number
  color: string
}

const uid = useId()
const ids = {
  screen: `${uid}-screen`,
  bezel: `${uid}-bezel`,
  gloss: `${uid}-gloss`,
  capTop: `${uid}-cap-top`,
  screenClip: `${uid}-screen-clip`,
}

const questionIndex = ref(0)
const isPicking = ref(false)
const question = computed(() => QUESTIONS[questionIndex.value]!)
const questionParts = computed(() => question.value.text.split('___'))

const confetti: Confetti[] = []
let confettiKey = 0
let phase: Phase = 'ask'
let phaseTime = 0
let speed = 1

function tileLayout(index: number) {
  const isTwo = question.value.options.length === 2
  const height = isTwo ? 126 : 58
  const x = -220 + (index % 2) * 136
  const y = 200 + (isTwo ? 0 : Math.floor(index / 2) * 68)
  return { x, y, width: TILE_WIDTH, height }
}

function tileTone(index: number) {
  if (question.value.type === 'truefalse') return index === 0 ? TRUE_TONE : FALSE_TONE
  return TONES[index]!
}

function throwConfetti() {
  const tile = tileLayout(question.value.answer)
  for (let k = 0; k < CONFETTI_COUNT; k++) {
    const a = -Math.PI / 2 + (Math.random() - 0.5) * 2.2
    const velocity = 90 + Math.random() * 110
    confetti.push({
      key: confettiKey++,
      x: tile.x + tile.width / 2,
      y: tile.y + tile.height / 2,
      vx: Math.cos(a) * velocity,
      vy: Math.sin(a) * velocity,
      spin: Math.random() * 360,
      life: 0,
      color: CONFETTI_COLORS[k % CONFETTI_COLORS.length]!,
    })
  }
}

function reveal() {
  phase = 'reveal'
  phaseTime = 0
  isPicking.value = false
  throwConfetti()
}

function stepPhase() {
  if (phase === 'ask' && phaseTime > ASK_S) {
    phase = 'pick'
    phaseTime = 0
    isPicking.value = true
  } else if (phase === 'pick' && phaseTime > PICK_S) {
    reveal()
  } else if (phase === 'reveal' && phaseTime > REVEAL_S) {
    phase = 'out'
    phaseTime = 0
  } else if (phase === 'out' && phaseTime > OUT_S) {
    questionIndex.value = (questionIndex.value + 1) % QUESTIONS.length
    phase = 'ask'
    phaseTime = -0.2
  }
}

function stepConfetti(dt: number) {
  for (let k = confetti.length - 1; k >= 0; k--) {
    const piece = confetti[k]!
    piece.life += dt / CONFETTI_LIFE_S
    if (piece.life >= 1) {
      confetti.splice(k, 1)
      continue
    }
    piece.vy += GRAVITY * dt
    piece.x += piece.vx * dt
    piece.y += piece.vy * dt
    piece.spin += 400 * dt
  }
}

function tileScale(index: number) {
  const isAnswer = index === question.value.answer
  if (phase === 'pick' && isAnswer) return 1 + Math.sin(phaseTime * 22) * 0.04
  if (phase === 'reveal' && isAnswer) return 1 + Math.max(0, 0.12 - phaseTime * 0.3)
  const u = phase === 'ask' ? Math.max(0, Math.min(1, (phaseTime - index * 0.09) / 0.35)) : 1
  return u < 1 ? 1 - Math.pow(1 - u, 3) * Math.cos(u * 9) : 1
}

function calcBoard() {
  const isAnswered = phase === 'reveal' || phase === 'out'
  const tiles = question.value.options.map((label, index) => {
    const layout = tileLayout(index)
    const tone = tileTone(index)
    const isAnswer = index === question.value.answer
    const cx = layout.x + layout.width / 2
    const cy = layout.y + layout.height / 2
    const scale = Math.max(0, tileScale(index)).toFixed(3)
    return {
      key: index,
      label,
      width: layout.width,
      height: layout.height,
      transform: `translate(${cx} ${cy}) scale(${scale}) translate(${-layout.width / 2} ${-layout.height / 2})`,
      opacity: isAnswered && !isAnswer ? 0.45 : 1,
      isCorrect: isAnswered && isAnswer,
      style: { '--tile-base': tone.base, '--tile-tint': tone.tint, '--tile-ink': tone.ink },
    }
  })
  const cardIn = phase === 'out' ? 1 - phaseTime / OUT_S : 1
  return {
    tiles,
    cardOpacity: Math.max(0, cardIn).toFixed(2),
    timerWidth: phase === 'ask' ? (TIMER_WIDTH * Math.max(0, 1 - phaseTime / ASK_S)).toFixed(1) : null,
    confetti: confetti.map((piece) => ({
      key: piece.key,
      color: piece.color,
      transform: `translate(${piece.x.toFixed(1)} ${piece.y.toFixed(1)}) rotate(${piece.spin.toFixed(0)})`,
      opacity: (1 - piece.life).toFixed(2),
    })),
  }
}

const board = shallowRef(calcBoard())
let lastTimerWidth = String(TIMER_WIDTH)

const { requestFrame } = useFrameLoop((rawDt) => {
  const dt = Math.min(rawDt, MAX_DT_S)
  phaseTime += dt * speed
  stepPhase()
  stepConfetti(dt)
  speed += (1 - speed) * SPEED_EASING
  const next = calcBoard()
  // Таймер замирает на месте, пока идут остальные фазы
  lastTimerWidth = next.timerWidth ?? lastTimerWidth
  board.value = { ...next, timerWidth: lastTimerWidth }
})

function onPress() {
  if (phase === 'ask' || phase === 'pick') {
    reveal()
  } else if (phase === 'reveal') {
    phase = 'out'
    phaseTime = 0
  }
  requestFrame()
}
</script>

<style scoped lang="scss">
.nat-teacher {
  &__question {
    font-family: var(--font-body);
    font-size: 23px;
    font-weight: 700;
    fill: #1a2140;
    text-anchor: middle;
  }

  &__option {
    font-family: var(--font-body);
    font-size: 21px;
    font-weight: 700;
    text-anchor: middle;
    dominant-baseline: central;
  }

  &__tile-bg {
    fill: var(--tile-tint);
    stroke: var(--tile-base);
    stroke-opacity: 0.35;
    stroke-width: 1.5;
    transition: fill 0.3s;
  }

  &__tile-base {
    fill: var(--tile-base);
    opacity: 0.55;
  }

  &__ink {
    fill: var(--tile-ink);
    transition: fill 0.3s;
  }

  &__ink-stroke {
    stroke: var(--tile-ink);
    transition: stroke 0.3s;
  }

  &__tile--correct &__tile-bg {
    fill: var(--tile-base);
    stroke-opacity: 0;
  }

  &__tile--correct &__ink {
    fill: #fff;
  }

  &__tile--correct &__ink-stroke {
    stroke: #fff;
  }

  &__tassel {
    transform-box: view-box;
    transform-origin: 352px 112px;
    animation: nat-tassel 1.8s ease-in-out infinite alternate;
  }

  &__stylus {
    transform-box: view-box;
    transform-origin: 118px 372px;

    &--picking {
      animation: nat-tap 0.25s ease-in-out infinite alternate;
    }
  }
}

@keyframes nat-tassel {
  from {
    transform: rotate(-9deg);
  }

  to {
    transform: rotate(11deg);
  }
}

@keyframes nat-tap {
  from {
    transform: rotate(0deg);
  }

  to {
    transform: rotate(-5deg);
  }
}

@media (prefers-reduced-motion: reduce) {
  .nat-teacher__tassel,
  .nat-teacher__stylus--picking {
    animation: none;
  }
}
</style>
