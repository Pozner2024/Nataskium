<template>
  <NatRobot label="Нат-шестерёнка. Нажми, чтобы он улыбнулся" follows-cursor :view-box="compact ? COMPACT_VIEW_BOX : VIEW_BOX" @press="onPress">
    <template #defs>
      <radialGradient :id="ids.gearMain" cx="35%" cy="30%" r="85%">
        <stop offset="0" stop-color="#FFFFFF" />
        <stop offset=".55" stop-color="#D5E0F7" />
        <stop offset="1" stop-color="#8FA6DA" />
      </radialGradient>
      <radialGradient :id="ids.gearBlue" cx="35%" cy="30%" r="85%">
        <stop offset="0" stop-color="#93B0F9" />
        <stop offset=".5" stop-color="#4573F4" />
        <stop offset="1" stop-color="#2B56D8" />
      </radialGradient>
      <radialGradient :id="ids.gearOrange" cx="35%" cy="30%" r="85%">
        <stop offset="0" stop-color="#FFD7A6" />
        <stop offset=".5" stop-color="#E98D34" />
        <stop offset="1" stop-color="#B96B2A" />
      </radialGradient>
      <radialGradient :id="ids.antBall" cx="35%" cy="30%" r="75%">
        <stop offset="0" stop-color="#F8DAB4" />
        <stop offset=".45" stop-color="#E98D34" />
        <stop offset="1" stop-color="#A55D1F" />
      </radialGradient>
      <radialGradient :id="ids.antHalo">
        <stop offset="0" stop-color="#E98D34" stop-opacity=".85" />
        <stop offset="1" stop-color="#E98D34" stop-opacity="0" />
      </radialGradient>
    </template>

    <template #back>
      <g
        v-for="(gear, index) in gears"
        :key="index"
        class="nat-gear__gear"
        :transform="`translate(${gear.x} ${gear.y})`"
        :style="{ '--gear-glow': gear.glow }"
      >
        <g :transform="`translate(0 ${DEPTH})`">
          <!-- крутится сама шестерня, а «бок» всегда снизу — так объём не вращается вместе с ней -->
          <path :d="gear.path" :fill="gear.side" :stroke="gear.side" stroke-width="2" stroke-linejoin="round" :transform="rotations[index]" />
        </g>
        <g :transform="rotations[index]">
          <path :d="gear.path" :fill="`url(#${gear.fillId})`" stroke="#fff" stroke-opacity=".55" stroke-width="1.5" stroke-linejoin="round" />
          <template v-if="gear.hasHub">
            <circle :r="gear.pitchRadius * 0.42" fill="#fff" fill-opacity=".22" />
            <circle
              v-for="hole in gear.holes"
              :key="hole.key"
              :cx="hole.cx"
              :cy="hole.cy"
              :r="gear.pitchRadius * 0.13"
              fill="#8FA6B8"
              fill-opacity=".55"
            />
            <circle :r="gear.pitchRadius * 0.16" fill="#8FA6B8" fill-opacity=".7" />
          </template>
        </g>
      </g>

      <g :transform="`rotate(${(antenna.angle * RAD_TO_DEG).toFixed(2)} 255 137)`">
        <NatAntennaCap />
        <path d="M255 136 L243 128" stroke="#A7B0C8" stroke-width="4" stroke-linecap="round" />
        <g fill="none" stroke="#6D768F" stroke-width="4" stroke-linecap="round">
          <path v-for="(d, index) in antenna.backCoils" :key="index" :d="d" />
        </g>
        <g fill="none" stroke="#D5DAE3" stroke-width="4" stroke-linecap="round">
          <path v-for="(d, index) in antenna.frontCoils" :key="index" :d="d" />
        </g>
        <path :d="`M243 ${antenna.top} L255 ${antenna.top - 8}`" stroke="#A7B0C8" stroke-width="4" stroke-linecap="round" />
        <NatAntennaBall :cx="255" :cy="antenna.top - 22" :radius="16" :flash="antenna.flash" :ball-id="ids.antBall" :halo-id="ids.antHalo" />
      </g>
    </template>
  </NatRobot>
</template>

<script setup lang="ts">
import { shallowRef, useId } from 'vue'
import NatRobot from '../NatRobot.vue'
import NatAntennaBall from '../parts/NatAntennaBall.vue'
import NatAntennaCap from '../parts/NatAntennaCap.vue'
import { createSpring, idleSway, kickSpring, MAX_SPRING_DT_S, RAD_TO_DEG, stepSpring } from '../lib/spring'
import { useFrameLoop } from '../lib/useFrameLoop'

defineProps<{
  compact?: boolean
}>()

// Все шестерни с одним модулем зуба, поэтому зацепляются; скорость малой = скорость большой × (N большой / N малой)
const CENTER = { x: 255, y: 280.5 }
const VIEW_BOX = '-95 -85 710 710'
// Компактная сцена для узких блоков: только шестерёнки и антенна, без пустых полей вокруг
const COMPACT_VIEW_BOX = '-45 5 610 500'
const MODULE = 13.75
const SPIN = 0.3
const DEPTH = 7
const HOLE_COUNT = 5
const COIL_COUNT = 6
const COIL_GAP = 9.5
const COIL_BOTTOM = 128
const JOY_SPEED = 4
const SPEED_EASING = 0.03

interface GearConfig {
  teeth: number
  fill: 'gearMain' | 'gearBlue' | 'gearOrange'
  side: string
  glow: string
  hasHub: boolean
  directionDeg?: number
}

const GEAR_CONFIGS: GearConfig[] = [
  { teeth: 24, fill: 'gearMain', side: '#6F84B8', glow: 'rgb(170 200 255 / 0.45)', hasHub: false },
  { teeth: 12, fill: 'gearBlue', side: '#1E40AC', glow: '#4573F4', hasHub: true, directionDeg: -38 },
  { teeth: 10, fill: 'gearOrange', side: '#8A4F1E', glow: '#E98D34', hasHub: true, directionDeg: 150 },
]

const uid = useId()
const ids = {
  gearMain: `${uid}-gear-main`,
  gearBlue: `${uid}-gear-blue`,
  gearOrange: `${uid}-gear-orange`,
  antBall: `${uid}-ant-ball`,
  antHalo: `${uid}-ant-halo`,
}

function gearPath(teeth: number) {
  const pitch = MODULE * teeth / 2
  const tip = pitch + MODULE * 0.9
  const root = pitch - MODULE * 1.1
  const halfTooth = Math.PI / (2 * teeth)
  const point = (r: number, a: number) => `${(r * Math.cos(a)).toFixed(2)} ${(r * Math.sin(a)).toFixed(2)}`
  let d = ''
  for (let i = 0; i < teeth; i++) {
    const center = 2 * Math.PI * i / teeth
    d += `${i ? 'L' : 'M'}${point(root, center - halfTooth * 1.35)} L${point(tip, center - halfTooth * 0.72)} `
      + `L${point(tip, center + halfTooth * 0.72)} L${point(root, center + halfTooth * 1.35)} `
  }
  return `${d}Z`
}

const mainGear = GEAR_CONFIGS[0]!
const mainPitch = MODULE * mainGear.teeth / 2

const gears = GEAR_CONFIGS.map((config) => {
  const pitchRadius = MODULE * config.teeth / 2
  const holes = Array.from({ length: HOLE_COUNT }, (_, k) => {
    const a = 2 * Math.PI * k / HOLE_COUNT
    const r = pitchRadius * 0.62
    return { key: k, cx: (r * Math.cos(a)).toFixed(1), cy: (r * Math.sin(a)).toFixed(1) }
  })
  const base = { ...config, pitchRadius, holes, path: gearPath(config.teeth), fillId: ids[config.fill] }

  if (config.directionDeg === undefined) {
    return { ...base, x: CENTER.x, y: CENTER.y, ratio: 1, offset: 0 }
  }

  const direction = config.directionDeg / RAD_TO_DEG
  const distance = mainPitch + pitchRadius
  return {
    ...base,
    x: CENTER.x + distance * Math.cos(direction),
    y: CENTER.y + distance * Math.sin(direction),
    ratio: -mainGear.teeth / config.teeth,
    // Когда зуб большой шестерни смотрит на малую, напротив него у малой — впадина
    offset: direction + Math.PI + Math.PI / config.teeth + (mainGear.teeth / config.teeth) * direction,
  }
})

const spring = createSpring()
let angle = 0
let antennaTime = 0
let speed = 1

function calcRotations() {
  return gears.map((gear) => `rotate(${((gear.ratio * angle + gear.offset) * RAD_TO_DEG).toFixed(2)})`)
}

// Витки пружины в объёме: задние полувитки темнее передних
function calcAntenna() {
  const gap = COIL_GAP * spring.stretch
  const backCoils: string[] = []
  const frontCoils: string[] = []
  for (let i = 0; i < COIL_COUNT; i++) {
    const y = COIL_BOTTOM - i * gap
    backCoils.push(`M243 ${y} A12 4.2 0 0 1 267 ${y - gap / 2}`)
    frontCoils.push(`M267 ${y - gap / 2} A12 4.2 0 0 1 243 ${y - gap}`)
  }
  return {
    angle: spring.angle,
    flash: spring.flash,
    top: COIL_BOTTOM - COIL_COUNT * gap,
    backCoils,
    frontCoils,
  }
}

const rotations = shallowRef(calcRotations())
const antenna = shallowRef(calcAntenna())

const { requestFrame } = useFrameLoop((dt) => {
  angle += dt * SPIN * speed
  speed += (1 - speed) * SPEED_EASING
  const antennaDt = Math.min(dt, MAX_SPRING_DT_S)
  antennaTime += antennaDt
  stepSpring(spring, antennaDt, idleSway(antennaTime))
  rotations.value = calcRotations()
  antenna.value = calcAntenna()
})

function onPress() {
  speed = JOY_SPEED
  kickSpring(spring)
  spring.flash = 1
  requestFrame()
}
</script>

<style scoped lang="scss">
.nat-gear__gear {
  filter: drop-shadow(0 0 10px var(--gear-glow));
}
</style>
