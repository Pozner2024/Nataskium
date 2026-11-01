<template>
  <NatRobot
    label="Нат-лампочка. Нажми, чтобы включить или выключить свет"
    follows-cursor
    manual-joy
    :aria-pressed="isOn"
    :eye-color="look.eyeColor"
    :glow-color="look.glowColor"
    :body-filter="look.bodyFilter"
    ref="robot"
    @press="onPress"
  >
    <template #defs>
      <radialGradient :id="ids.aura">
        <stop offset="0" stop-color="#FFE7A3" stop-opacity="1" />
        <stop offset=".45" stop-color="#FFC75A" stop-opacity=".5" />
        <stop offset="1" stop-color="#E98D34" stop-opacity="0" />
      </radialGradient>
      <radialGradient :id="ids.warmTint" cx="50%" cy="45%" r="60%">
        <stop offset="0" stop-color="#FFF6D2" />
        <stop offset=".7" stop-color="#FFE08A" />
        <stop offset="1" stop-color="#FFC24D" />
      </radialGradient>
      <linearGradient :id="ids.metal" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0" stop-color="#5D6578" />
        <stop offset=".3" stop-color="#C9CFDC" />
        <stop offset=".45" stop-color="#F4F6FB" />
        <stop offset=".7" stop-color="#9AA2B5" />
        <stop offset="1" stop-color="#4C5366" />
      </linearGradient>
      <clipPath :id="ids.bulbGlass"><circle cx="255" cy="280.5" r="147" /></clipPath>
      <radialGradient :id="ids.miniGlass" cx="38%" cy="32%" r="75%">
        <stop offset="0" stop-color="#FFFFFF" stop-opacity=".95" />
        <stop offset=".6" stop-color="#FFF3C4" stop-opacity=".55" />
        <stop offset="1" stop-color="#F2C45A" stop-opacity=".45" />
      </radialGradient>
      <radialGradient :id="ids.miniHalo">
        <stop offset="0" stop-color="#FFD66B" stop-opacity=".9" />
        <stop offset="1" stop-color="#FFD66B" stop-opacity="0" />
      </radialGradient>
      <linearGradient :id="ids.miniMetal" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0" stop-color="#7D8696" />
        <stop offset=".45" stop-color="#E9ECF0" />
        <stop offset="1" stop-color="#6D768F" />
      </linearGradient>
    </template>

    <template #back>
      <circle cx="255" cy="280.5" :r="look.auraRadius" :fill="`url(#${ids.aura})`" :opacity="look.auraOpacity" />
      <g stroke="#FFD27A" stroke-linecap="round" :opacity="look.raysOpacity">
        <line v-for="ray in look.rays" :key="ray.key" v-bind="ray.attrs" />
      </g>

      <g :transform="`rotate(${(antenna.angle * RAD_TO_DEG).toFixed(2)} 255 137)`">
        <NatAntennaCap />
        <path :d="antenna.springPath" fill="none" stroke="#A7B0C8" stroke-width="4.5" stroke-linecap="round" />
        <rect x="245" :y="antenna.top - 16" width="20" height="16" rx="3" :fill="`url(#${ids.miniMetal})`" />
        <path :d="`M245 ${antenna.top - 11} H265 M245 ${antenna.top - 6} H265`" stroke="#5D6578" stroke-width="1.5" opacity=".6" />
        <circle cx="255" :cy="antenna.top - 38" :r="antenna.haloRadius" :fill="`url(#${ids.miniHalo})`" :opacity="antenna.glow" />
        <path
          :d="antenna.glassPath"
          :fill="`url(#${ids.miniGlass})`"
          stroke="#E2B44C"
          stroke-opacity=".5"
          stroke-width="1.2"
        />
        <path
          :d="antenna.filamentPath"
          fill="none"
          stroke="#C67127"
          stroke-width="1.8"
          stroke-linejoin="round"
          :opacity="antenna.filamentOpacity"
        />
        <ellipse cx="248" :cy="antenna.top - 48" rx="5" ry="8" fill="#fff" opacity=".55" :transform="`rotate(-20 248 ${antenna.top - 48})`" />
      </g>
    </template>

    <template #overlay>
      <circle cx="255" cy="280.5" r="147" :fill="`url(#${ids.warmTint})`" :clip-path="`url(#${ids.bulbGlass})`" :opacity="look.tintOpacity" />
    </template>

    <template #front>
      <path d="M170 398 Q255 418 340 398 L326 438 Q255 452 184 438 Z" :fill="`url(#${ids.metal})`" />
      <rect x="184" y="436" width="142" height="17" rx="8.5" :fill="`url(#${ids.metal})`" />
      <rect x="188" y="451" width="134" height="17" rx="8.5" :fill="`url(#${ids.metal})`" />
      <rect x="192" y="466" width="126" height="17" rx="8.5" :fill="`url(#${ids.metal})`" />
      <path d="M200 482 L310 482 Q300 500 255 503 Q210 500 200 482 Z" fill="#2A2F3E" />
      <ellipse cx="255" cy="503" rx="16" ry="5" fill="#C9CFDC" />
      <path d="M180 410 Q255 428 330 410" fill="none" stroke="#fff" stroke-opacity=".35" stroke-width="2" />
    </template>
  </NatRobot>
</template>

<script setup lang="ts">
import { ref, shallowRef, useId } from 'vue'
import NatRobot from '../NatRobot.vue'
import NatAntennaCap from '../parts/NatAntennaCap.vue'
import { createSpring, idleSway, kickSpring, MAX_SPRING_DT_S, RAD_TO_DEG, stepSpring, zigzag } from '../lib/spring'
import { useFrameLoop } from '../lib/useFrameLoop'

type Rgb = [number, number, number]

const CENTER = { x: 255, y: 280.5 }
const RAY_COUNT = 14
const IDEA_DURATION_S = 2.6
const IDEA_DURATION_MS = IDEA_DURATION_S * 1000
const IDEA_MIN_INTERVAL_S = 9
const IDEA_RANDOM_INTERVAL_S = 5
const FLICKER_CHANCE = 0.02
const MAX_DT_S = 0.05
const ANTENNA_HEIGHT = 34
const COLD_EYE: Rgb = [207, 234, 255]
const WARM_EYE: Rgb = [255, 236, 170]
const COLD_GLOW: Rgb = [79, 163, 255]
const WARM_GLOW: Rgb = [255, 176, 60]
const COLD_BODY: Rgb = [170, 200, 255]
const WARM_BODY: Rgb = [255, 205, 110]

const uid = useId()
const ids = {
  aura: `${uid}-aura`,
  warmTint: `${uid}-warm-tint`,
  metal: `${uid}-metal`,
  bulbGlass: `${uid}-bulb-glass`,
  miniGlass: `${uid}-mini-glass`,
  miniHalo: `${uid}-mini-halo`,
  miniMetal: `${uid}-mini-metal`,
}

const robot = ref<InstanceType<typeof NatRobot> | null>(null)
const isOn = ref(false)
const spring = createSpring()

// light — яркость от 0 (еле тлеет) до 1 («идея!»)
let light = 0
let time = 0
let antennaTime = 0
let ideaUntil = -1
let nextIdea = IDEA_MIN_INTERVAL_S + Math.random() * IDEA_RANDOM_INTERVAL_S

function mix(from: Rgb, to: Rgb, k: number) {
  return from.map((v, i) => Math.round(v + (to[i]! - v) * k))
}

function rgb(color: number[]) {
  return `rgb(${color.join(' ')})`
}

function calcLook() {
  const rays = Array.from({ length: RAY_COUNT }, (_, i) => {
    const a = (i / RAY_COUNT) * 2 * Math.PI + time * 0.25
    const pulse = 0.5 + 0.5 * Math.sin(time * 6 + i * 1.7)
    const r1 = 172 + light * 6
    const r2 = r1 + 22 + light * 30 * (0.6 + 0.4 * pulse)
    // Под колбой цоколь — лучи там плавно гаснут
    const fromDown = Math.abs(Math.atan2(Math.sin(a - Math.PI / 2), Math.cos(a - Math.PI / 2)))
    return {
      key: i,
      attrs: {
        'x1': CENTER.x + r1 * Math.cos(a),
        'y1': CENTER.y + r1 * Math.sin(a),
        'x2': CENTER.x + r2 * Math.cos(a),
        'y2': CENTER.y + r2 * Math.sin(a),
        'stroke-width': 5 + 3 * pulse,
        'opacity': Math.min(1, Math.max(0, (fromDown - 0.55) / 0.35)).toFixed(2),
      },
    }
  })
  const bodyGlow = mix(COLD_BODY, WARM_BODY, light).join(' ')
  return {
    rays,
    auraRadius: 230 + light * 60,
    auraOpacity: light.toFixed(3),
    tintOpacity: (light * 0.6).toFixed(3),
    raysOpacity: Math.max(0, light * 1.3 - 0.3).toFixed(3),
    eyeColor: rgb(mix(COLD_EYE, WARM_EYE, light)),
    glowColor: rgb(mix(COLD_GLOW, WARM_GLOW, light)),
    bodyFilter: `drop-shadow(0 0 ${18 + light * 26}px rgb(${bodyGlow} / ${0.45 + light * 0.4}))`,
  }
}

function calcAntenna() {
  const top = 136 - ANTENNA_HEIGHT * spring.stretch
  const glow = 0.15 + light * 0.85
  return {
    angle: spring.angle,
    top,
    glow: glow.toFixed(2),
    haloRadius: (26 + glow * 22).toFixed(1),
    filamentOpacity: (0.35 + glow * 0.65).toFixed(2),
    springPath: zigzag(255, 136, top, 3, 9),
    glassPath: `M247 ${top - 16} C247 ${top - 24} 236 ${top - 28} 236 ${top - 40} A19 19 0 1 1 274 ${top - 40} `
      + `C274 ${top - 28} 263 ${top - 24} 263 ${top - 16} Z`,
    filamentPath: `M250 ${top - 18} L250 ${top - 34} L253 ${top - 39} L255 ${top - 34} L257 ${top - 39} L260 ${top - 34} L260 ${top - 18}`,
  }
}

const look = shallowRef(calcLook())
const antenna = shallowRef(calcAntenna())

function idea() {
  ideaUntil = time + IDEA_DURATION_S
  robot.value?.rejoice(IDEA_DURATION_MS)
}

function updateLight(dt: number) {
  time += dt
  if (time > nextIdea) {
    if (!isOn.value) idea()
    nextIdea = time + IDEA_MIN_INTERVAL_S + Math.random() * IDEA_RANDOM_INTERVAL_S
  }
  const isBright = isOn.value || time < ideaUntil
  const flicker = Math.random() < FLICKER_CHANCE ? 0.12 : 0
  const target = isBright ? 0.92 + 0.08 * Math.sin(time * 9) : 0.1 + 0.04 * Math.sin(time * 1.7) + flicker
  const fadeRate = isOn.value || ideaUntil > 0 ? 0.04 : 0.09
  light += (target - light) * (target > light ? 0.18 : fadeRate)
}

const { requestFrame } = useFrameLoop((rawDt) => {
  updateLight(Math.min(rawDt, MAX_DT_S))
  const antennaDt = Math.min(rawDt, MAX_SPRING_DT_S)
  antennaTime += antennaDt
  stepSpring(spring, antennaDt, idleSway(antennaTime))
  look.value = calcLook()
  antenna.value = calcAntenna()
})

function onPress() {
  kickSpring(spring)
  isOn.value = !isOn.value
  if (isOn.value) {
    idea()
  } else {
    ideaUntil = -1
    robot.value?.calm()
  }
  requestFrame()
}
</script>
