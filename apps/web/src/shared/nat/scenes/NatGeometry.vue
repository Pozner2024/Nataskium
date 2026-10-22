<template>
  <NatRobot label="Нат-геометрия. Нажми, чтобы сменить фигуру" view-box="-95 -85 710 710" follows-cursor @press="onPress">
    <template #defs>
      <radialGradient :id="ids.vertexHalo">
        <stop offset="0" stop-color="#FFFFFF" stop-opacity="1" />
        <stop offset=".35" stop-color="#4573F4" stop-opacity=".55" />
        <stop offset="1" stop-color="#4573F4" stop-opacity="0" />
      </radialGradient>
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
      <line v-for="edge in backEdges" :key="edge.key" v-bind="edge.attrs" stroke-linecap="round" />
      <g v-for="vertex in backVertices" :key="vertex.key" :opacity="vertex.opacity">
        <circle :cx="vertex.cx" :cy="vertex.cy" :r="vertex.haloRadius" :fill="`url(#${ids.vertexHalo})`" />
        <circle :cx="vertex.cx" :cy="vertex.cy" :r="vertex.coreRadius" fill="#F2FAFF" />
      </g>

      <g :transform="`rotate(${(antenna.angle * RAD_TO_DEG).toFixed(2)} 255 137)`">
        <NatAntennaCap />
        <path :d="antenna.springPath" fill="none" stroke="#A7B0C8" stroke-width="5" stroke-linecap="round" />
        <NatAntennaBall :cx="255" :cy="antenna.ballY" :radius="ANTENNA_BALL_RADIUS" :flash="antenna.flash" :ball-id="ids.antBall" :halo-id="ids.antHalo" />
      </g>
    </template>

    <template #front>
      <line v-for="edge in frontEdges" :key="edge.key" v-bind="edge.attrs" stroke-linecap="round" />
      <g v-for="vertex in frontVertices" :key="vertex.key" :opacity="vertex.opacity">
        <circle :cx="vertex.cx" :cy="vertex.cy" :r="vertex.haloRadius" :fill="`url(#${ids.vertexHalo})`" />
        <circle :cx="vertex.cx" :cy="vertex.cy" :r="vertex.coreRadius" fill="#F2FAFF" />
      </g>
    </template>
  </NatRobot>
</template>

<script setup lang="ts">
import { computed, shallowRef, useId } from 'vue'
import NatRobot from '../NatRobot.vue'
import NatAntennaBall from '../parts/NatAntennaBall.vue'
import NatAntennaCap from '../parts/NatAntennaCap.vue'
import { createSpring, idleSway, kickSpring, MAX_SPRING_DT_S, RAD_TO_DEG, stepSpring, zigzag } from '../lib/spring'
import { useFrameLoop } from '../lib/useFrameLoop'

const CENTER = { x: 255, y: 280.5 }
const SIZE = 238
const FOCAL = 900
const SPIN = { y: 0.42, x: 0.23 }
const HOLD_S = 6
const MORPH_S = 0.9
const MAX_DT_S = 0.05
const PHI = (1 + Math.sqrt(5)) / 2
const ANTENNA_HEIGHT = 62
const ANTENNA_BALL_RADIUS = 17
const JOY_SPEED = 3
const SPEED_EASING = 0.03

type Vector = [number, number, number]

interface Shape {
  vertices: Vector[]
  edges: [number, number][]
}

const RAW_SHAPES: Vector[][] = [
  [-1, 1].flatMap((x) => [-1, 1].flatMap((y) => [-1, 1].map((z): Vector => [x, y, z]))),
  [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]],
  [-1, 1].flatMap((a) => [-1, 1].flatMap((b): Vector[] => [[0, a, b * PHI], [a, b * PHI, 0], [b * PHI, 0, a]])),
]

function distance(a: Vector, b: Vector) {
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2])
}

// Нормируем на одну описанную сферу; рёбра — пары вершин на минимальном расстоянии
function buildShape(raw: Vector[]): Shape {
  const norm = Math.hypot(...raw[0]!)
  const vertices = raw.map((p) => p.map((c) => c / norm * SIZE) as Vector)
  let minDistance = Infinity
  for (let i = 0; i < vertices.length; i++) {
    for (let j = i + 1; j < vertices.length; j++) minDistance = Math.min(minDistance, distance(vertices[i]!, vertices[j]!))
  }
  const edges: [number, number][] = []
  for (let i = 0; i < vertices.length; i++) {
    for (let j = i + 1; j < vertices.length; j++) {
      if (distance(vertices[i]!, vertices[j]!) < minDistance * 1.01) edges.push([i, j])
    }
  }
  return { vertices, edges }
}

const SHAPES = RAW_SHAPES.map(buildShape)

const uid = useId()
const ids = {
  vertexHalo: `${uid}-vertex-halo`,
  antBall: `${uid}-ant-ball`,
  antHalo: `${uid}-ant-halo`,
}

function rotate([x, y, z]: Vector, ay: number, ax: number): Vector {
  const x1 = x * Math.cos(ay) + z * Math.sin(ay)
  const z1 = -x * Math.sin(ay) + z * Math.cos(ay)
  const y2 = y * Math.cos(ax) - z1 * Math.sin(ax)
  const z2 = y * Math.sin(ax) + z1 * Math.cos(ax)
  return [x1, y2, z2]
}

let current = 0
let previous = -1
let morph = 1
let time = 0
let untilNext = HOLD_S
let speed = 1
let antennaTime = 0
const spring = createSpring()

// Ближние к зрителю рёбра — перед Натом и ярче, дальние — за ним и тусклее
function drawShape(shapeIndex: number, scale: number, alpha: number, ay: number, ax: number) {
  const shape = SHAPES[shapeIndex]!
  const points = shape.vertices.map((p) => {
    const [x, y, z] = rotate(p.map((c) => c * scale) as Vector, ay, ax)
    const k = FOCAL / (FOCAL - z)
    return { x: CENTER.x + x * k, y: CENTER.y + y * k, z, k }
  })
  const edges = shape.edges.map(([i, j], n) => {
    const a = points[i]!
    const b = points[j]!
    const z = (a.z + b.z) / 2
    const near = (z / SIZE + 1) / 2
    return {
      key: `${shapeIndex}-e${n}`,
      isNear: z > 0,
      attrs: {
        'x1': a.x.toFixed(1),
        'y1': a.y.toFixed(1),
        'x2': b.x.toFixed(1),
        'y2': b.y.toFixed(1),
        'stroke': near > 0.5 ? '#4573F4' : '#5A6FB0',
        'stroke-width': (1.4 + near * 1.8).toFixed(2),
        'stroke-opacity': ((0.3 + near * 0.6) * alpha).toFixed(2),
      },
    }
  })
  const vertices = points.map((p, n) => {
    const near = (p.z / SIZE + 1) / 2
    return {
      key: `${shapeIndex}-v${n}`,
      isNear: p.z > 0,
      cx: p.x.toFixed(1),
      cy: p.y.toFixed(1),
      haloRadius: (13 * p.k).toFixed(1),
      coreRadius: (3 * p.k).toFixed(2),
      opacity: ((0.45 + near * 0.55) * alpha).toFixed(2),
    }
  })
  return { edges, vertices }
}

function calcScene() {
  const ease = 1 - Math.pow(1 - morph, 3)
  const ay = time * SPIN.y
  const ax = 0.35 + Math.sin(time * SPIN.x) * 0.45
  const drawn = [drawShape(current, 1.35 - 0.35 * ease, ease, ay, ax)]
  if (previous >= 0) drawn.unshift(drawShape(previous, 1 - 0.45 * ease, 1 - ease, ay, ax))
  return {
    edges: drawn.flatMap((d) => d.edges),
    vertices: drawn.flatMap((d) => d.vertices),
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

function nextShape() {
  previous = current
  current = (current + 1) % SHAPES.length
  morph = 0
  untilNext = HOLD_S
}

const scene = shallowRef(calcScene())
const antenna = shallowRef(calcAntenna())
const backEdges = computed(() => scene.value.edges.filter((e) => !e.isNear))
const frontEdges = computed(() => scene.value.edges.filter((e) => e.isNear))
const backVertices = computed(() => scene.value.vertices.filter((v) => !v.isNear))
const frontVertices = computed(() => scene.value.vertices.filter((v) => v.isNear))

const { requestFrame } = useFrameLoop((rawDt) => {
  const dt = Math.min(rawDt, MAX_DT_S)
  time += dt * speed
  morph = Math.min(1, morph + dt / MORPH_S)
  if (morph >= 1) previous = -1
  untilNext -= dt
  if (untilNext <= 0) nextShape()
  speed += (1 - speed) * SPEED_EASING
  const antennaDt = Math.min(rawDt, MAX_SPRING_DT_S)
  antennaTime += antennaDt
  stepSpring(spring, antennaDt, idleSway(antennaTime))
  scene.value = calcScene()
  antenna.value = calcAntenna()
})

function onPress() {
  speed = JOY_SPEED
  nextShape()
  kickSpring(spring)
  spring.flash = 1
  requestFrame()
}
</script>
