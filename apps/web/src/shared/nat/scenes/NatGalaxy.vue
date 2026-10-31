<template>
  <NatRobot label="Нат-галактика. Нажми, чтобы он улыбнулся" view-box="-95 -85 710 710" follows-cursor @press="onPress">
    <template #defs>
      <radialGradient :id="ids.core">
        <stop offset="0" stop-color="#FFF4E0" stop-opacity="1" />
        <stop offset=".45" stop-color="#C9B8FF" stop-opacity=".5" />
        <stop offset="1" stop-color="#6A5BFF" stop-opacity="0" />
      </radialGradient>
      <!-- ближняя (нижняя) половина диска повторяется поверх Ната — как кольцо у Сатурна -->
      <clipPath :id="ids.discFront"><rect x="-400" y="0" width="800" height="400" /></clipPath>
      <clipPath :id="ids.natEdge"><circle cx="255" cy="280.5" r="150" /></clipPath>
      <radialGradient :id="ids.glintHalo">
        <stop offset="0" stop-color="#F2F4F7" stop-opacity=".9" />
        <stop offset=".35" stop-color="#C9CFD8" stop-opacity=".35" />
        <stop offset="1" stop-color="#C9CFD8" stop-opacity="0" />
      </radialGradient>
      <linearGradient :id="ids.silver" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="#FFFFFF" />
        <stop offset=".45" stop-color="#D5DAE1" />
        <stop offset=".7" stop-color="#A7AFBB" />
        <stop offset="1" stop-color="#E9ECF0" />
      </linearGradient>
      <radialGradient :id="ids.antBall" cx="35%" cy="30%" r="75%">
        <stop offset="0" stop-color="#E2D6FF" />
        <stop offset=".45" stop-color="#7B5BE8" />
        <stop offset="1" stop-color="#4B2FB8" />
      </radialGradient>
      <radialGradient :id="ids.antHalo">
        <stop offset="0" stop-color="#B04FD8" stop-opacity=".85" />
        <stop offset="1" stop-color="#B04FD8" stop-opacity="0" />
      </radialGradient>
    </template>

    <template #back>
      <g>
        <circle
          v-for="star in FAR_STARS"
          :key="star.key"
          class="nat-galaxy__twinkle"
          :cx="star.x"
          :cy="star.y"
          :r="star.r"
          fill="#DCE6FF"
          :style="{ animationDelay: star.delay, animationDuration: star.duration }"
        />
      </g>
      <ellipse cx="255" cy="290" rx="300" ry="210" :fill="`url(#${ids.core})`" transform="rotate(-14 255 290)" />
      <g :transform="PLANE_TRANSFORM">
        <g :id="ids.disc" :transform="`rotate(${discAngle.toFixed(2)})`">
          <image v-if="discImage" :href="discImage" :x="-HALF_SIZE" :y="-HALF_SIZE" :width="DISC_SIZE" :height="DISC_SIZE" />
          <circle
            v-for="star in BIG_STARS"
            :key="star.key"
            class="nat-galaxy__twinkle"
            :cx="star.x"
            :cy="star.y"
            :r="star.r"
            fill="#fff"
            :style="{ animationDelay: star.delay }"
          />
        </g>
      </g>
      <g>
        <g v-for="glint in glintViews" :key="glint.key" :transform="glint.transform">
          <circle r=".7" :fill="`url(#${ids.glintHalo})`" />
          <circle r=".4" :fill="glint.color" opacity=".5" />
          <path :d="RAY" :fill="`url(#${ids.silver})`" stroke="#7D8696" stroke-width=".05" stroke-opacity=".7" />
          <path :d="RAY" :fill="`url(#${ids.silver})`" opacity=".7" transform="rotate(45) scale(.55)" />
        </g>
      </g>
      <NatRadioAntenna v-bind="antennaView" wave-color="#8B6CFF" :ball-id="ids.antBall" :halo-id="ids.antHalo" />
    </template>

    <template #front>
      <g :clip-path="`url(#${ids.natEdge})`">
        <g :transform="PLANE_TRANSFORM" :clip-path="`url(#${ids.discFront})`">
          <use :href="`#${ids.disc}`" />
        </g>
      </g>
    </template>
  </NatRobot>
</template>

<script setup lang="ts">
import { onMounted, ref, shallowRef, useId } from 'vue'
import NatRobot from '../NatRobot.vue'
import NatRadioAntenna from '../parts/NatRadioAntenna.vue'
import { createSeededRandom } from '../../lib'
import { createSpring, idleSway, kickSpring, MAX_SPRING_DT_S, RAD_TO_DEG, stepSpring } from '../lib/spring'
import { useFrameLoop } from '../lib/useFrameLoop'

const CENTER = { x: 255, y: 290 }
const DISC = { tilt: -14, squash: 0.56, spinDegPerS: 6 }
const PLANE_TRANSFORM = `translate(${CENTER.x} ${CENTER.y}) rotate(${DISC.tilt}) scale(1 ${DISC.squash})`
const ARMS = 5
const STAR_COUNT = 1900
const BIG_STAR_COUNT = 60
const FAR_STAR_COUNT = 70
const WIND = 3.6
const PALETTE = ['#FFFFFF', '#4573F4', '#4573F4', '#E98D34', '#B04FD8', '#14A8C8']
const NEBULA_COLORS = ['#5B4BE8', '#4573F4', '#C050E8', '#1FA8C8', '#7B5BE8']
const NEBULAE_PER_ARM = 5
const RANDOM_SEED = 5
const DISC_SIZE = 760
const HALF_SIZE = DISC_SIZE / 2
const CANVAS_DENSITY = 2
const TWINKLE_S = 2.6
const GLINT_COLORS = ['#C9CFD8', '#B3BAC6', '#DDE1E7']
const GLINT_FROM_DISC_CHANCE = 0.7
const BIG_GLINT_CHANCE = 0.3
const JOY_GLINTS = 6
const JOY_BIG_GLINTS = 2
const JOY_SPEED = 6
const SPEED_EASING = 0.03
const MAX_DT_S = 0.05
const RAY = 'M0 -1 C1 -0.15 0.15 -0.15 1 0 C0.15 0.15 0.15 0.15 0 1 C-0.15 0.15 -0.15 0.15 -1 0 C-0.15 -0.15 -0.15 -0.15 0 -1 Z'

interface Star {
  x: number
  y: number
}

interface Glint {
  key: number
  star: Star
  isFromDisc: boolean
  color: string
  size: number
  life: number
  durationS: number
}

const uid = useId()
const ids = {
  core: `${uid}-core`,
  discFront: `${uid}-disc-front`,
  natEdge: `${uid}-nat-edge`,
  glintHalo: `${uid}-glint-halo`,
  silver: `${uid}-silver`,
  antBall: `${uid}-ant-ball`,
  antHalo: `${uid}-ant-halo`,
  disc: `${uid}-disc`,
}

const spiral = (arm: number, r: number) => arm * 2 * Math.PI / ARMS + Math.log(r / 150) * WIND

// Звёзды на логарифмических спиралях с разбросом; ближе к ядру — гуще и крупнее.
// Порядок вызовов random задаёт раскладку, поэтому звёзды диска, крупные и дальние считаются строго по очереди
const random = createSeededRandom(RANDOM_SEED)

const DISC_STARS = Array.from({ length: STAR_COUNT }, (_, i) => {
  const arm = i % ARMS
  const r = 152 + Math.pow(random(), 1.25) * 188
  const a = spiral(arm, r) + (random() - 0.5) * (0.16 + (r - 152) / 900)
  const x = r * Math.cos(a) + (random() - 0.5) * 10
  const y = r * Math.sin(a) + (random() - 0.5) * 10
  const size = (0.8 + random() * 1.7) * (r < 210 ? 1.25 : 1)
  const color = PALETTE[Math.floor(random() * PALETTE.length)]!
  const alpha = 0.55 + random() * 0.45
  return { x, y, size, color, alpha }
})

const BIG_STARS = Array.from({ length: BIG_STAR_COUNT }, (_, i) => {
  const arm = i % ARMS
  const r = 160 + random() * 170
  const a = spiral(arm, r) + (random() - 0.5) * 0.3
  return {
    key: i,
    x: Number((r * Math.cos(a)).toFixed(1)),
    y: Number((r * Math.sin(a)).toFixed(1)),
    r: (1.6 + random() * 1.4).toFixed(2),
    delay: `${(-random() * TWINKLE_S).toFixed(2)}s`,
  }
})

const FAR_STARS = Array.from({ length: FAR_STAR_COUNT }, (_, i) => ({
  key: i,
  x: Number((-80 + random() * 680).toFixed(1)),
  y: Number((-70 + random() * 680).toFixed(1)),
  r: (0.5 + random() * 1.1).toFixed(2),
  delay: `${(-random() * TWINKLE_S).toFixed(2)}s`,
  duration: `${(2 + random() * 3).toFixed(1)}s`,
}))

// Диск рисуется один раз на canvas и вставляется картинкой: вращать одну картинку дёшево,
// а тысячу звёзд со свечением браузер перерисовывал бы каждый кадр
function drawDisc() {
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = DISC_SIZE * CANVAS_DENSITY
  const ctx = canvas.getContext('2d')
  if (!ctx) return ''
  ctx.scale(CANVAS_DENSITY, CANVAS_DENSITY)
  ctx.translate(HALF_SIZE, HALF_SIZE)

  ctx.filter = 'blur(16px)'
  for (let arm = 0; arm < ARMS; arm++) {
    for (let k = 0; k < NEBULAE_PER_ARM; k++) {
      const r = 168 + k * 36
      const a = spiral(arm, r)
      ctx.save()
      ctx.translate(r * Math.cos(a), r * Math.sin(a))
      ctx.rotate(a + 1.2)
      ctx.globalAlpha = 0.5
      ctx.fillStyle = NEBULA_COLORS[(arm + k) % NEBULA_COLORS.length]!
      ctx.beginPath()
      ctx.ellipse(0, 0, 54 - k * 6, 26 - k * 3, 0, 0, 2 * Math.PI)
      ctx.fill()
      ctx.restore()
    }
  }
  ctx.filter = 'none'

  for (const star of DISC_STARS) {
    ctx.globalAlpha = star.alpha
    ctx.shadowColor = star.color
    ctx.shadowBlur = 4
    ctx.fillStyle = star.color
    ctx.beginPath()
    ctx.arc(star.x, star.y, star.size, 0, 2 * Math.PI)
    ctx.fill()
  }
  return canvas.toDataURL()
}

const discImage = ref('')
const discAngle = ref(0)
const glintViews = shallowRef<{ key: number, color: string, transform: string }[]>([])
const spring = createSpring()
const glints: Glint[] = []
let glintKey = 0
let untilGlint = 0.5
let antennaTime = 0
let speed = 1

function calcAntenna() {
  return { angle: spring.angle, stretch: spring.stretch, flash: spring.flash, time: antennaTime }
}

const antennaView = shallowRef(calcAntenna())

// Звезда диска → координаты сцены: поворот диска, сжатие плоскости, наклон, центр
function onDisc(star: Star) {
  const a = discAngle.value / RAD_TO_DEG
  const px = star.x * Math.cos(a) - star.y * Math.sin(a)
  const py = (star.x * Math.sin(a) + star.y * Math.cos(a)) * DISC.squash
  const tilt = DISC.tilt / RAD_TO_DEG
  return { x: CENTER.x + px * Math.cos(tilt) - py * Math.sin(tilt), y: CENTER.y + px * Math.sin(tilt) + py * Math.cos(tilt) }
}

function pick<T>(items: readonly T[]) {
  return items[Math.floor(Math.random() * items.length)]!
}

function addGlint(isBig: boolean) {
  const isFromDisc = Math.random() < GLINT_FROM_DISC_CHANCE
  glints.push({
    key: glintKey++,
    star: isFromDisc ? pick(BIG_STARS) : pick(FAR_STARS),
    isFromDisc,
    color: pick(GLINT_COLORS),
    size: (isBig ? 13 : 8) + Math.random() * 5,
    life: 0,
    durationS: 0.7 + Math.random() * 0.5,
  })
}

// Звезда вспыхивает: лучи вырастают, чуть поворачиваются и гаснут
function updateGlints(dt: number) {
  untilGlint -= dt * speed
  if (untilGlint <= 0) {
    addGlint(Math.random() < BIG_GLINT_CHANCE)
    untilGlint = 0.25 + Math.random() * 0.8
  }
  for (let k = glints.length - 1; k >= 0; k--) {
    const glint = glints[k]!
    glint.life += dt / glint.durationS
    if (glint.life >= 1) glints.splice(k, 1)
  }
  glintViews.value = glints.map((glint) => {
    const p = glint.isFromDisc ? onDisc(glint.star) : glint.star
    const scale = glint.size * Math.pow(Math.sin(glint.life * Math.PI), 1.5)
    return {
      key: glint.key,
      color: glint.color,
      transform: `translate(${p.x.toFixed(1)} ${p.y.toFixed(1)}) rotate(${(glint.life * 40).toFixed(1)}) scale(${scale.toFixed(2)})`,
    }
  })
}

const { requestFrame } = useFrameLoop((rawDt) => {
  const dt = Math.min(rawDt, MAX_DT_S)
  discAngle.value += dt * DISC.spinDegPerS * speed
  updateGlints(dt)
  speed += (1 - speed) * SPEED_EASING
  const antennaDt = Math.min(rawDt, MAX_SPRING_DT_S)
  antennaTime += antennaDt
  stepSpring(spring, antennaDt, idleSway(antennaTime))
  antennaView.value = calcAntenna()
})

onMounted(() => {
  discImage.value = drawDisc()
})

function onPress() {
  speed = JOY_SPEED
  for (let k = 0; k < JOY_GLINTS; k++) addGlint(k < JOY_BIG_GLINTS)
  kickSpring(spring)
  spring.flash = 1
  requestFrame()
}
</script>

<style scoped lang="scss">
.nat-galaxy__twinkle {
  animation: nat-twinkle 2.6s ease-in-out infinite alternate;
}

@keyframes nat-twinkle {
  from {
    opacity: 0.25;
  }

  to {
    opacity: 1;
  }
}

@media (prefers-reduced-motion: reduce) {
  .nat-galaxy__twinkle {
    animation: none;
  }
}
</style>
