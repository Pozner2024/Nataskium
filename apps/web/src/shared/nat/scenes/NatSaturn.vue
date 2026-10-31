<template>
  <NatRobot label="Нат-Сатурн. Нажми, чтобы он улыбнулся" follows-cursor @press="onPress">
    <template #defs>
      <!-- Кольцо целиком лежит за планетой, поверх повторяется только ближняя половина — шов уходит на край шара -->
      <clipPath :id="ids.ringFront"><rect x="-400" y="0" width="800" height="400" /></clipPath>
      <clipPath :id="ids.planet"><circle cx="255" cy="280.5" r="147" /></clipPath>
      <clipPath :id="ids.planetEdge"><circle cx="255" cy="280.5" r="150" /></clipPath>
      <filter :id="ids.bandBlur" x="-10%" y="-50%" width="120%" height="200%"><feGaussianBlur stdDeviation="4" /></filter>
      <filter :id="ids.ringGlow" x="-20%" y="-50%" width="140%" height="200%">
        <feGaussianBlur stdDeviation="3" result="b" />
        <feMerge>
          <feMergeNode in="b" />
          <feMergeNode in="SourceGraphic" />
        </feMerge>
      </filter>
      <radialGradient :id="ids.antBall" cx="35%" cy="30%" r="75%">
        <stop offset="0" stop-color="#FFF1D6" />
        <stop offset=".45" stop-color="#D9A66A" />
        <stop offset="1" stop-color="#A8743A" />
      </radialGradient>
      <radialGradient :id="ids.antHalo">
        <stop offset="0" stop-color="#E6C08A" stop-opacity=".85" />
        <stop offset="1" stop-color="#E6C08A" stop-opacity="0" />
      </radialGradient>
    </template>

    <template #back>
      <g :transform="RING_TRANSFORM">
        <g :filter="`url(#${ids.ringGlow})`">
          <circle v-for="band in BANDS" :key="band.r" :r="band.r" fill="none" :stroke="band.color" :stroke-opacity="band.opacity" :stroke-width="band.width" />
        </g>
      </g>
      <g fill="#fff">
        <circle v-for="dot in backDots" :key="dot.key" :cx="dot.cx" :cy="dot.cy" :r="dot.r" :opacity="dot.opacity" />
      </g>
      <NatRadioAntenna v-bind="antennaView" wave-color="#C98F55" :ball-id="ids.antBall" :halo-id="ids.antHalo" />
    </template>

    <template #overlay>
      <g :clip-path="`url(#${ids.planet})`" opacity=".5">
        <g transform="rotate(-14 255 300)" :filter="`url(#${ids.bandBlur})`">
          <rect x="80" y="160" width="360" height="16" fill="#C9B48E" opacity=".55" />
          <rect x="80" y="190" width="360" height="10" fill="#E0B57E" opacity=".5" />
          <rect x="80" y="372" width="360" height="14" fill="#E0B57E" opacity=".45" />
          <rect x="80" y="398" width="360" height="20" fill="#A99F8E" opacity=".5" />
        </g>
      </g>
    </template>

    <template #front>
      <g :clip-path="`url(#${ids.planetEdge})`">
        <g :transform="RING_TRANSFORM" :clip-path="`url(#${ids.ringFront})`">
          <g :filter="`url(#${ids.ringGlow})`">
            <circle v-for="band in BANDS" :key="band.r" :r="band.r" fill="none" :stroke="band.color" :stroke-opacity="band.opacity" :stroke-width="band.width" />
          </g>
        </g>
      </g>
      <g fill="#fff">
        <circle v-for="dot in frontDots" :key="dot.key" :cx="dot.cx" :cy="dot.cy" :r="dot.r" :opacity="dot.opacity" />
      </g>
    </template>
  </NatRobot>
</template>

<script setup lang="ts">
import { computed, shallowRef, useId } from 'vue'
import NatRobot from '../NatRobot.vue'
import NatRadioAntenna from '../parts/NatRadioAntenna.vue'
import { createSeededRandom } from '../../lib'
import { createSpring, idleSway, kickSpring, MAX_SPRING_DT_S, RAD_TO_DEG, stepSpring } from '../lib/spring'
import { useFrameLoop } from '../lib/useFrameLoop'

const RING = { cx: 255, cy: 305, tilt: -14, squash: 0.27 }
const RING_TRANSFORM = `translate(${RING.cx} ${RING.cy}) rotate(${RING.tilt}) scale(1 ${RING.squash})`
// Цвета как у настоящего Сатурна: тусклое кольцо C, кремовое B, серо-бежевое A и тонкое F; между 240 и 245 — щель Кассини
const BANDS = [
  { r: 176, width: 16, color: '#8E877C', opacity: 0.55 },
  { r: 202, width: 32, color: '#E6D6B8', opacity: 0.9 },
  { r: 230, width: 20, color: '#D9A66A', opacity: 0.85 },
  { r: 256, width: 22, color: '#BEB4A3', opacity: 0.85 },
  { r: 274, width: 8, color: '#C98F55', opacity: 0.7 },
]
const DOT_TRACKS = [190, 202, 214, 232, 252, 262]
const DOT_SPACING = 48
const RANDOM_SEED = 7
const BASE_ANGULAR_SPEED = 0.34
const BASE_RADIUS = 200
const JOY_SPEED = 4
const SPEED_EASING = 0.03

interface Dot {
  key: number
  radius: number
  size: string
  startAngle: number
  phase: number
  rate: number
}

const uid = useId()
const ids = {
  ringFront: `${uid}-ring-front`,
  planet: `${uid}-planet`,
  planetEdge: `${uid}-planet-edge`,
  bandBlur: `${uid}-band-blur`,
  ringGlow: `${uid}-ring-glow`,
  antBall: `${uid}-ant-ball`,
  antHalo: `${uid}-ant-halo`,
}

// Блёстки льда рисуются в плоскости экрана, а не кольца, поэтому остаются точками, а не чёрточками
const random = createSeededRandom(RANDOM_SEED)
const dots: Dot[] = DOT_TRACKS.flatMap((radius) => {
  const count = Math.round(2 * Math.PI * radius / DOT_SPACING)
  return Array.from({ length: count }, (_, k) => ({
    key: radius * 1000 + k,
    radius,
    size: (0.9 + random() * 1.1).toFixed(2),
    startAngle: (k + random() * 0.8) / count * 2 * Math.PI,
    phase: random() * 6.28,
    rate: 1.5 + random() * 2.5,
  }))
})

// Как у настоящих колец: внутренние дорожки вращаются быстрее внешних
function angularSpeed(radius: number) {
  return BASE_ANGULAR_SPEED * Math.pow(BASE_RADIUS / radius, 1.5)
}

const tiltRad = RING.tilt / RAD_TO_DEG
const tiltCos = Math.cos(tiltRad)
const tiltSin = Math.sin(tiltRad)
const spring = createSpring()

let ringTime = 0
let clock = 0
let antennaTime = 0
let speed = 1

function calcDots() {
  return dots.map((dot) => {
    const angle = dot.startAngle + ringTime * angularSpeed(dot.radius)
    const lx = dot.radius * Math.cos(angle)
    const ly = dot.radius * Math.sin(angle) * RING.squash
    return {
      key: dot.key,
      cx: (RING.cx + lx * tiltCos - ly * tiltSin).toFixed(1),
      cy: (RING.cy + lx * tiltSin + ly * tiltCos).toFixed(1),
      r: dot.size,
      opacity: (0.55 + 0.45 * Math.sin(clock * dot.rate + dot.phase)).toFixed(2),
      isNear: Math.sin(angle) > 0,
    }
  })
}

function calcAntenna() {
  return { angle: spring.angle, stretch: spring.stretch, flash: spring.flash, time: antennaTime }
}

const dotViews = shallowRef(calcDots())
const antennaView = shallowRef(calcAntenna())
const backDots = computed(() => dotViews.value.filter((dot) => !dot.isNear))
const frontDots = computed(() => dotViews.value.filter((dot) => dot.isNear))

const { requestFrame } = useFrameLoop((dt) => {
  ringTime += dt * speed
  clock += dt
  speed += (1 - speed) * SPEED_EASING
  const antennaDt = Math.min(dt, MAX_SPRING_DT_S)
  antennaTime += antennaDt
  stepSpring(spring, antennaDt, idleSway(antennaTime))
  dotViews.value = calcDots()
  antennaView.value = calcAntenna()
})

function onPress() {
  speed = JOY_SPEED
  kickSpring(spring)
  spring.flash = 1
  requestFrame()
}
</script>
