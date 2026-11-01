<template>
  <NatRobot label="Нат-мозг со светящимися нейронами. Нажми, чтобы он улыбнулся" view-box="-95 -85 710 710" follows-cursor @press="onPress">
    <template #defs>
      <radialGradient :id="ids.neuronCore">
        <stop offset="0" stop-color="#FFFFFF" />
        <stop offset=".45" stop-color="#FFFFFF" stop-opacity=".95" />
        <stop offset="1" stop-color="#FFFFFF" stop-opacity="0" />
      </radialGradient>
      <filter :id="ids.pulseGlow" x="-50%" y="-50%" width="200%" height="200%">
        <feGaussianBlur stdDeviation="3.5" result="b" />
        <feMerge>
          <feMergeNode in="b" />
          <feMergeNode in="b" />
          <feMergeNode in="SourceGraphic" />
        </feMerge>
      </filter>
      <radialGradient v-for="color in HALO_COLORS" :id="haloId(color)" :key="color">
        <stop offset="0" :stop-color="color" stop-opacity=".85" />
        <stop offset=".45" :stop-color="color" stop-opacity=".35" />
        <stop offset="1" :stop-color="color" stop-opacity="0" />
      </radialGradient>
      <radialGradient :id="ids.antBallB" cx="35%" cy="30%" r="75%">
        <stop offset="0" stop-color="#C3D3FC" />
        <stop offset=".45" stop-color="#4573F4" />
        <stop offset="1" stop-color="#2246BC" />
      </radialGradient>
      <radialGradient :id="ids.antBallG" cx="35%" cy="30%" r="75%">
        <stop offset="0" stop-color="#C0EDAE" />
        <stop offset=".45" stop-color="#5BA339" />
        <stop offset="1" stop-color="#3B7321" />
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
      <radialGradient :id="ids.antHaloG">
        <stop offset="0" stop-color="#5BA339" stop-opacity=".8" />
        <stop offset="1" stop-color="#5BA339" stop-opacity="0" />
      </radialGradient>
      <radialGradient :id="ids.antHaloO">
        <stop offset="0" stop-color="#E98D34" stop-opacity=".85" />
        <stop offset="1" stop-color="#E98D34" stop-opacity="0" />
      </radialGradient>
    </template>

    <template #back>
      <g fill="none" stroke-linecap="round">
        <path v-for="edge in network.edges" :key="edge.key" :d="edge.d" stroke="#5A6FB0" stroke-opacity=".45" :stroke-width="edge.width" />
      </g>
      <g :filter="`url(#${ids.pulseGlow})`">
        <circle v-for="pulse in network.pulses" :key="pulse.key" :cx="pulse.cx" :cy="pulse.cy" r="4" :fill="pulse.color" />
      </g>
      <g>
        <g v-for="neuron in network.neurons" :key="neuron.key">
          <circle :cx="neuron.cx" :cy="neuron.cy" :r="neuron.haloRadius" :opacity="neuron.haloOpacity" :fill="`url(#${neuron.haloId})`" />
          <circle :cx="neuron.cx" :cy="neuron.cy" :r="neuron.coreRadius" :fill="`url(#${ids.neuronCore})`" />
        </g>
      </g>

      <NatAntennaCap />
      <g v-for="stalk in antenna" :key="stalk.key">
        <path :d="stalk.d" fill="none" stroke="#A7B0C8" stroke-width="3.5" stroke-linecap="round" />
        <NatAntennaBall v-bind="stalk.ball" />
      </g>
    </template>
  </NatRobot>
</template>

<script setup lang="ts">
import { shallowRef, useId } from 'vue'
import NatRobot from '../NatRobot.vue'
import NatAntennaBall from '../parts/NatAntennaBall.vue'
import NatAntennaCap from '../parts/NatAntennaCap.vue'
import { createSeededRandom } from '../../lib'
import { createSpring, idleSway, kickSpring, MAX_SPRING_DT_S, stepSpring, type Spring } from '../lib/spring'
import { useFrameLoop } from '../lib/useFrameLoop'

const CENTER = { x: 255, y: 280.5 }
const HEAD_RADIUS = 150
const NEURON_COUNT = 26
const PULSE_SPEED = 240
const MAX_PULSES = 30
const COLORS = ['#4573F4', '#4573F4', '#5BA339', '#E98D34']
const HALO_COLORS = [...new Set(COLORS)]
const HUB_PULSE_COLOR = '#2549C5'
const RANDOM_SEED = 7
const LINK_RADIUS = 240
const DRIFT = 7
const HUB_FORWARD_CHANCE = 0.95
const NEURON_FORWARD_CHANCE = 0.8
const HEAT_DECAY = 0.93
const FLASH_DECAY = 0.9
const MAX_DT_S = 0.05
const JOY_SPEED = 2.5
const SPEED_EASING = 0.03
const ANTENNA_BASE = { x: 255, y: 137 }
const ANTENNA_PHASE_STEP = 1.7

interface NeuronNode {
  isHub: boolean
  baseX: number
  baseY: number
  x: number
  y: number
  size: number
  color: string
  phase: number
  flash: number
}

interface Edge {
  key: string
  a: number
  b: number
  bend: number
  heat: number
}

interface Pulse {
  key: number
  edge: Edge
  from: number
  to: number
  progress: number
  color: string
}

// Цвет шарика антенны: первая буква blue / green / orange, по ней собираются id градиентов
type BallColor = 'B' | 'G' | 'O'

interface Dendrite {
  spring: Spring
  color: BallColor
  phase: number
  direction: number
  length: number
  radius: number
}

const uid = useId()
const ids = {
  neuronCore: `${uid}-neuron-core`,
  pulseGlow: `${uid}-pulse-glow`,
  antBallB: `${uid}-ant-ball-b`,
  antBallG: `${uid}-ant-ball-g`,
  antBallO: `${uid}-ant-ball-o`,
  antHaloB: `${uid}-ant-halo-b`,
  antHaloG: `${uid}-ant-halo-g`,
  antHaloO: `${uid}-ant-halo-o`,
}

function haloId(color: string) {
  return `${uid}-halo-${color.slice(1)}`
}

// Узел 0 — сам Нат, остальные — облако нейронов вокруг него с разбросом по углу и расстоянию
const random = createSeededRandom(RANDOM_SEED)
const nodes: NeuronNode[] = [
  { isHub: true, baseX: CENTER.x, baseY: CENTER.y, x: CENTER.x, y: CENTER.y, size: 0, color: '', phase: 0, flash: 0 },
]
for (let i = 0; i < NEURON_COUNT; i++) {
  const a = (i / NEURON_COUNT) * 2 * Math.PI + (random() - 0.5) * 0.45
  const r = 172 + Math.pow(random(), 0.8) * 140
  const baseX = CENTER.x + r * Math.cos(a)
  const baseY = CENTER.y + r * Math.sin(a) * 0.92
  nodes.push({
    isHub: false,
    baseX,
    baseY,
    x: baseX,
    y: baseY,
    size: 3.5 + random() * 4.5,
    color: COLORS[Math.floor(random() * COLORS.length)]!,
    phase: random() * 6.28,
    flash: 0,
  })
}

const edges: Edge[] = []
function link(a: number, b: number) {
  const key = a < b ? `${a}-${b}` : `${b}-${a}`
  if (a === b || edges.some((edge) => edge.key === key)) return
  edges.push({ key, a, b, bend: (random() - 0.5) * 50, heat: 0 })
}
for (let i = 1; i <= NEURON_COUNT; i++) {
  const node = nodes[i]!
  const nearest = nodes
    .map((other, j) => ({ j, distance: Math.hypot(other.baseX - node.baseX, other.baseY - node.baseY) }))
    .filter(({ j }) => j > 0 && j !== i)
    .sort((p, q) => p.distance - q.distance)
  link(i, nearest[0]!.j)
  link(i, nearest[1]!.j)
  if (random() < 0.6) link(i, nearest[2]!.j)
  if (Math.hypot(node.baseX - CENTER.x, node.baseY - CENTER.y) < LINK_RADIUS || random() < 0.3) link(0, i)
}
const neighbours = nodes.map((_, i) => edges.filter((edge) => edge.a === i || edge.b === i))

// Для Ната точка синапса — на краю шара в сторону соседа
function position(index: number, toward: number) {
  const node = nodes[index]!
  if (!node.isHub) return { x: node.x, y: node.y }
  const other = nodes[toward]!
  const a = Math.atan2(other.y - CENTER.y, other.x - CENTER.x)
  return { x: CENTER.x + HEAD_RADIUS * Math.cos(a), y: CENTER.y + HEAD_RADIUS * Math.sin(a) }
}

function curve(edge: Edge) {
  const start = position(edge.a, edge.b)
  const end = position(edge.b, edge.a)
  const length = Math.hypot(end.x - start.x, end.y - start.y) || 1
  const midX = (start.x + end.x) / 2
  const midY = (start.y + end.y) / 2
  return {
    x1: start.x,
    y1: start.y,
    x2: end.x,
    y2: end.y,
    cx: midX - (end.y - start.y) / length * edge.bend,
    cy: midY + (end.x - start.x) / length * edge.bend,
    length,
  }
}

function pointOnCurve(c: ReturnType<typeof curve>, u: number) {
  return {
    x: (1 - u) * (1 - u) * c.x1 + 2 * (1 - u) * u * c.cx + u * u * c.x2,
    y: (1 - u) * (1 - u) * c.y1 + 2 * (1 - u) * u * c.cy + u * u * c.y2,
  }
}

const pulses: Pulse[] = []
let pulseKey = 0

function emitPulse(edge: Edge, from: number) {
  pulses.push({
    key: pulseKey++,
    edge,
    from,
    to: edge.a === from ? edge.b : edge.a,
    progress: 0,
    color: from === 0 ? HUB_PULSE_COLOR : nodes[from]!.color,
  })
}

function fire(from: number, exclude?: Edge) {
  const options = neighbours[from]!.filter((edge) => edge !== exclude)
  if (!options.length || pulses.length > MAX_PULSES) return
  emitPulse(options[Math.floor(Math.random() * options.length)]!, from)
}

let networkTime = 0
let nextSpark = 0
let speed = 1

function stepNetwork(dt: number) {
  networkTime += dt
  for (const node of nodes) {
    if (node.isHub) continue
    node.x = node.baseX + Math.sin(networkTime * 0.6 + node.phase) * DRIFT
    node.y = node.baseY + Math.cos(networkTime * 0.5 + node.phase * 1.3) * DRIFT
  }
  nextSpark -= dt
  if (nextSpark <= 0) {
    fire(1 + Math.floor(Math.random() * NEURON_COUNT))
    nextSpark = 0.35 + Math.random() * 0.5
  }
  for (let k = pulses.length - 1; k >= 0; k--) {
    const pulse = pulses[k]!
    pulse.progress += dt * PULSE_SPEED / curve(pulse.edge).length
    pulse.edge.heat = 1
    if (pulse.progress < 1) continue
    nodes[pulse.to]!.flash = 1
    pulses.splice(k, 1)
    if (Math.random() < (pulse.to === 0 ? HUB_FORWARD_CHANCE : NEURON_FORWARD_CHANCE)) fire(pulse.to, pulse.edge)
  }
}

function calcNetwork() {
  const edgeViews = edges.map((edge) => {
    const c = curve(edge)
    const view = { key: edge.key, d: `M${c.x1} ${c.y1} Q${c.cx} ${c.cy} ${c.x2} ${c.y2}`, width: (1.4 + edge.heat * 0.8).toFixed(2) }
    edge.heat *= HEAT_DECAY
    return view
  })
  const pulseViews = pulses.map((pulse) => {
    const c = curve(pulse.edge)
    const point = pointOnCurve(c, pulse.from === pulse.edge.a ? pulse.progress : 1 - pulse.progress)
    return { key: pulse.key, cx: point.x, cy: point.y, color: pulse.color }
  })
  const neuronViews = nodes.slice(1).map((node, index) => {
    const view = {
      key: index,
      cx: node.x,
      cy: node.y,
      haloRadius: node.size * (4 + node.flash * 3),
      haloOpacity: 0.75 + node.flash * 0.25,
      coreRadius: node.size * (1 + node.flash * 0.5),
      haloId: haloId(node.color),
    }
    node.flash *= FLASH_DECAY
    return view
  })
  return { edges: edgeViews, pulses: pulseViews, neurons: neuronViews }
}

const DENDRITE_LAYOUTS: Omit<Dendrite, 'spring' | 'phase'>[] = [
  { direction: -0.5, length: 70, color: 'G', radius: 10 },
  { direction: 0.04, length: 92, color: 'B', radius: 11 },
  { direction: 0.52, length: 64, color: 'O', radius: 10 },
]

const dendrites: Dendrite[] = DENDRITE_LAYOUTS.map((layout, i) => ({
  ...layout,
  spring: createSpring(),
  phase: i * ANTENNA_PHASE_STEP,
}))
let antennaTime = 0
let nextDendrite = 0.6
let dendriteIndex = 0

function stalkCurve(angle: number, direction: number, length: number) {
  const tipAngle = direction + angle * 1.6
  const midAngle = direction + angle * 0.5
  return {
    tx: ANTENNA_BASE.x + Math.sin(tipAngle) * length,
    ty: ANTENNA_BASE.y - Math.cos(tipAngle) * length,
    cx: ANTENNA_BASE.x + Math.sin(midAngle) * length * 0.55,
    cy: ANTENNA_BASE.y - Math.cos(midAngle) * length * 0.55,
  }
}

function stepAntenna(dt: number) {
  antennaTime += dt
  for (const d of dendrites) stepSpring(d.spring, dt, idleSway(antennaTime, d.phase))
  nextDendrite -= dt
  if (nextDendrite <= 0) {
    dendrites[dendriteIndex]!.spring.flash = 1
    dendriteIndex = (dendriteIndex + 1) % dendrites.length
    nextDendrite = 0.5 + Math.random() * 0.6
  }
}

function calcAntenna() {
  return dendrites.map((d, index) => {
    const c = stalkCurve(d.spring.angle, d.direction, d.length * d.spring.stretch)
    const ux = Math.sin(d.direction + d.spring.angle * 1.6)
    const uy = -Math.cos(d.direction + d.spring.angle * 1.6)
    return {
      key: index,
      d: `M${ANTENNA_BASE.x} ${ANTENNA_BASE.y - 1} Q${c.cx.toFixed(1)} ${c.cy.toFixed(1)} ${c.tx.toFixed(1)} ${c.ty.toFixed(1)}`,
      ball: {
        cx: Number((c.tx + ux * (d.radius - 4)).toFixed(1)),
        cy: Number((c.ty + uy * (d.radius - 4)).toFixed(1)),
        radius: d.radius,
        flash: d.spring.flash,
        ballId: ids[`antBall${d.color}`],
        haloId: ids[`antHalo${d.color}`],
      },
    }
  })
}

const network = shallowRef(calcNetwork())
const antenna = shallowRef(calcAntenna())

const { requestFrame } = useFrameLoop((rawDt) => {
  stepNetwork(Math.min(rawDt, MAX_DT_S) * speed)
  speed += (1 - speed) * SPEED_EASING
  stepAntenna(Math.min(rawDt, MAX_SPRING_DT_S))
  network.value = calcNetwork()
  antenna.value = calcAntenna()
})

function onPress() {
  speed = JOY_SPEED
  for (const edge of neighbours[0]!) emitPulse(edge, 0)
  for (const d of dendrites) {
    kickSpring(d.spring)
    d.spring.flash = 1
  }
  requestFrame()
}
</script>
