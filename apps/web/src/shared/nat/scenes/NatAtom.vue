<template>
  <NatRobot label="Нат-атом. Нажми, чтобы он улыбнулся" follows-cursor @press="onPress">
    <template #defs>
      <linearGradient :id="ids.ringStroke" x1="0" y1="0" x2="1" y2="0">
        <!-- цвета непрозрачные: там, где передняя дуга лежит на полном кольце, стыка не видно -->
        <stop offset="0" stop-color="#7C828E" />
        <stop offset=".5" stop-color="#3B404C" />
        <stop offset="1" stop-color="#767C88" />
      </linearGradient>
      <filter :id="ids.ringGlow" x="-20%" y="-50%" width="140%" height="200%">
        <feGaussianBlur stdDeviation="3" result="b" />
        <feMerge>
          <feMergeNode in="b" />
          <feMergeNode in="SourceGraphic" />
        </feMerge>
      </filter>
      <radialGradient :id="ids.antBallB" cx="35%" cy="30%" r="75%">
        <stop offset="0" stop-color="#C3D3FC" />
        <stop offset=".45" stop-color="#4573F4" />
        <stop offset="1" stop-color="#2246BC" />
      </radialGradient>
      <radialGradient :id="ids.antBallO" cx="35%" cy="30%" r="75%">
        <stop offset="0" stop-color="#F8DAB4" />
        <stop offset=".45" stop-color="#E98D34" />
        <stop offset="1" stop-color="#A55D1F" />
      </radialGradient>
      <radialGradient :id="ids.antHaloB">
        <stop offset="0" stop-color="#4573F4" stop-opacity=".8" />
        <stop offset="1" stop-color="#4573F4" stop-opacity="0" />
      </radialGradient>
      <radialGradient :id="ids.antHaloO">
        <stop offset="0" stop-color="#E98D34" stop-opacity=".85" />
        <stop offset="1" stop-color="#E98D34" stop-opacity="0" />
      </radialGradient>
    </template>

    <template #back>
      <g
        v-for="ring in rings"
        :key="`back-${ring.key}`"
        :transform="ring.transform"
        :filter="`url(#${ids.ringGlow})`"
      >
        <path class="nat-atom__ring" :d="ring.backPath" :stroke="`url(#${ids.ringStroke})`" />
        <path class="nat-atom__ring-shine" :d="ring.backPath" transform="translate(0 -1.5)" />
      </g>
      <image
        v-for="ball in backBalls"
        :key="ball.key"
        class="nat-atom__ball"
        :href="ball.href"
        :x="ball.x"
        :y="ball.y"
        :width="ball.size"
        :height="ball.size"
        :style="{ '--ball-color': ball.color }"
      />
      <g v-for="ant in antennaViews" :key="ant.key" :transform="ant.transform">
        <ellipse :cx="ant.x" :cy="ant.y + 1" rx="10" ry="4" fill="#2E3548" />
        <path class="nat-atom__spring" :d="ant.springPath" />
        <NatAntennaBall
          :cx="ant.x"
          :cy="ant.ballY"
          :radius="ANTENNA_BALL_RADIUS"
          :flash="ant.flash"
          :ball-id="ant.ballId"
          :halo-id="ant.haloId"
        />
      </g>
    </template>

    <template #front>
      <g
        v-for="ring in rings"
        :key="`front-${ring.key}`"
        :transform="ring.transform"
        :filter="`url(#${ids.ringGlow})`"
      >
        <path class="nat-atom__ring" :d="ring.frontPath" :stroke="`url(#${ids.ringStroke})`" />
        <path class="nat-atom__ring-shine" :d="ring.frontPath" transform="translate(0 -1.5)" />
      </g>
      <image
        v-for="ball in frontBalls"
        :key="ball.key"
        class="nat-atom__ball"
        :href="ball.href"
        :x="ball.x"
        :y="ball.y"
        :width="ball.size"
        :height="ball.size"
        :style="{ '--ball-color': ball.color }"
      />
    </template>
  </NatRobot>
</template>

<script setup lang="ts">
import { computed, shallowRef, useId } from 'vue'
import NatRobot from '../NatRobot.vue'
import NatAntennaBall from '../parts/NatAntennaBall.vue'
import ballBlue from '../images/ballB.png'
import ballGreen from '../images/ballG.png'
import ballOrange from '../images/ballO.png'
import { createSpring, idleSway, kickSpring, MAX_SPRING_DT_S, RAD_TO_DEG, stepSpring, zigzag, type Spring } from '../lib/spring'
import { useFrameLoop } from '../lib/useFrameLoop'

const HEAD_CENTER_X = 255
const HEAD_CENTER_Y = 280
const HEAD_RADIUS = 147
const FAR_BALL_SCALE = 0.82
const JOY_SPEED = 4
const SPEED_EASING = 0.03
const ANTENNA_SPRING_HEIGHT = 44
const ANTENNA_BALL_OFFSET = 11
const ANTENNA_BALL_RADIUS = 12
const ANTENNA_LOOPS = 3
const ANTENNA_AMPLITUDE = 8
const ANTENNA_PHASE_STEP = 1.7

interface Ball {
  href: string
  color: string
  size: number
  phase: number
}

interface Orbit {
  cx: number
  cy: number
  rx: number
  ry: number
  tilt: number
  periodS: number
  balls: Ball[]
}

interface BallView {
  key: string
  href: string
  color: string
  x: number
  y: number
  size: number
  isHidden: boolean
}

interface Antenna {
  x: number
  y: number
  tilt: number
  color: 'B' | 'O'
  sway: number
  spring: Spring
}

const ORBITS: Orbit[] = [
  {
    cx: 255, cy: 300, rx: 225, ry: 52, tilt: -14, periodS: 6.5,
    balls: [{ href: ballBlue, color: '#4573F4', size: 46, phase: 0 }],
  },
  {
    cx: 255, cy: 300, rx: 195, ry: 70, tilt: 20, periodS: -9,
    balls: [
      { href: ballGreen, color: '#5BA339', size: 40, phase: 0.15 },
      { href: ballOrange, color: '#E98D34', size: 38, phase: 0.62 },
    ],
  },
]

const uid = useId()
const ids = {
  ringStroke: `${uid}-ring-stroke`,
  ringGlow: `${uid}-ring-glow`,
  antBallB: `${uid}-ant-ball-b`,
  antBallO: `${uid}-ant-ball-o`,
  antHaloB: `${uid}-ant-halo-b`,
  antHaloO: `${uid}-ant-halo-o`,
}

function arc(orbit: Orbit, from: number, to: number) {
  const x1 = orbit.rx * Math.cos(from)
  const y1 = orbit.ry * Math.sin(from)
  const x2 = orbit.rx * Math.cos(to)
  const y2 = orbit.ry * Math.sin(to)
  return `M${x1} ${y1} A${orbit.rx} ${orbit.ry} 0 0 1 ${x2} ${y2}`
}

// Кольцо целиком лежит за головой, а поверх головы повторяется только его передняя половина
const rings = ORBITS.map((orbit, index) => ({
  key: index,
  transform: `translate(${orbit.cx} ${orbit.cy}) rotate(${orbit.tilt})`,
  backPath: `${arc(orbit, Math.PI, 2 * Math.PI)}${arc(orbit, 0, Math.PI).replace(/^M[^A]*/, '')} Z`,
  frontPath: arc(orbit, 0, Math.PI),
}))

const antennas: Antenna[] = [
  { x: 214, y: 141, tilt: -24, color: 'B', sway: 1, spring: createSpring() },
  { x: 296, y: 141, tilt: 24, color: 'O', sway: -0.8, spring: createSpring() },
]

let orbitTime = 0
let antennaTime = 0
let speed = 1

function calcBalls(): BallView[] {
  return ORBITS.flatMap((orbit, orbitIndex) => {
    const tiltRad = orbit.tilt / RAD_TO_DEG
    const cos = Math.cos(tiltRad)
    const sin = Math.sin(tiltRad)

    return orbit.balls.map((ball, ballIndex) => {
      const angle = (orbitTime / orbit.periodS + ball.phase) * 2 * Math.PI
      const ex = orbit.rx * Math.cos(angle)
      const ey = orbit.ry * Math.sin(angle)
      const depth = Math.sin(angle)
      const size = ball.size * (FAR_BALL_SCALE + (1 - FAR_BALL_SCALE) * depth)
      const x = orbit.cx + ex * cos - ey * sin
      const y = orbit.cy + ex * sin + ey * cos
      // Шарик уходит за голову, только когда он на дальней стороне орбиты и закрыт корпусом
      const isHidden = depth < 0 && Math.hypot(x - HEAD_CENTER_X, y - HEAD_CENTER_Y) < HEAD_RADIUS + size / 2

      return {
        key: `${orbitIndex}-${ballIndex}`,
        href: ball.href,
        color: ball.color,
        x: x - size / 2,
        y: y - size / 2,
        size,
        isHidden,
      }
    })
  })
}

function calcAntennas() {
  return antennas.map((ant, index) => {
    const top = ant.y - ANTENNA_SPRING_HEIGHT * ant.spring.stretch
    return {
      key: index,
      x: ant.x,
      y: ant.y,
      transform: `rotate(${(ant.tilt + ant.spring.angle * RAD_TO_DEG).toFixed(2)} ${ant.x} ${ant.y})`,
      springPath: zigzag(ant.x, ant.y, top, ANTENNA_LOOPS, ANTENNA_AMPLITUDE),
      ballY: top - ANTENNA_BALL_OFFSET,
      flash: ant.spring.flash,
      haloId: ant.color === 'B' ? ids.antHaloB : ids.antHaloO,
      ballId: ant.color === 'B' ? ids.antBallB : ids.antBallO,
    }
  })
}

const ballViews = shallowRef(calcBalls())
const antennaViews = shallowRef(calcAntennas())
const backBalls = computed(() => ballViews.value.filter((ball) => ball.isHidden))
const frontBalls = computed(() => ballViews.value.filter((ball) => !ball.isHidden))

const { requestFrame } = useFrameLoop((dt) => {
  orbitTime += dt * speed
  speed += (1 - speed) * SPEED_EASING
  const antennaDt = Math.min(dt, MAX_SPRING_DT_S)
  antennaTime += antennaDt
  antennas.forEach((ant, index) => {
    stepSpring(ant.spring, antennaDt, idleSway(antennaTime, index * ANTENNA_PHASE_STEP) * ant.sway)
  })
  ballViews.value = calcBalls()
  antennaViews.value = calcAntennas()
})

function onPress() {
  speed = JOY_SPEED
  for (const ant of antennas) {
    kickSpring(ant.spring)
    ant.spring.flash = 1
  }
  requestFrame()
}
</script>

<style scoped lang="scss">
.nat-atom {
  &__ring {
    fill: none;
    stroke-width: 4.5;
    stroke-linecap: butt;
  }

  &__ring-shine {
    fill: none;
    stroke: #fff;
    stroke-opacity: 0.45;
    stroke-width: 1;
  }

  &__ball {
    filter: drop-shadow(0 0 8px var(--ball-color));
  }

  &__spring {
    fill: none;
    stroke: #a7b0c8;
    stroke-width: 4;
    stroke-linecap: round;
  }
}
</style>
