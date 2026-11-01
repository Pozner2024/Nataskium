<template>
  <NatRobot
    label="Нат и буквы. Нажми, чтобы буквы сложились во фразу"
    view-box="-95 -70 710 690"
    follows-cursor
    :joy-duration-ms="JOY_DURATION_MS"
    @press="onPress"
  >
    <template #defs>
      <radialGradient :id="ids.cursorHalo">
        <stop offset="0" stop-color="#4573F4" stop-opacity=".8" />
        <stop offset="1" stop-color="#4573F4" stop-opacity="0" />
      </radialGradient>
    </template>

    <template #back>
      <g
        v-for="letter in backLetters"
        :key="letter.key"
        class="nat-letters__letter"
        :transform="letter.transform"
        :opacity="letter.opacity"
        :style="{ '--letter-color': letter.color }"
      >
        <text class="nat-letters__text" text-anchor="middle" dominant-baseline="central" :fill="letter.color">{{ letter.char }}</text>
      </g>

      <g :transform="`rotate(${(antenna.angle * ANTENNA_SWING_DEG).toFixed(2)} 255 137)`">
        <NatAntennaCap />
        <line x1="255" y1="136" x2="255" :y2="antenna.tip" stroke="#A7B0C8" stroke-width="5" stroke-linecap="round" />
        <line x1="253" y1="132" x2="253" :y2="antenna.tip + 4" stroke="#fff" stroke-width="1.2" opacity=".5" />
        <circle cx="255" :cy="antenna.cursorY" :r="antenna.haloRadius" :fill="`url(#${ids.cursorHalo})`" :opacity="antenna.haloOpacity" />
        <g :opacity="antenna.isCursorOn ? 1 : 0.15">
          <rect x="252" :y="antenna.cursorY - 19" width="6" height="38" rx="3" fill="#4573F4" />
          <rect x="245" :y="antenna.cursorY - 21" width="20" height="5" rx="2.5" fill="#4573F4" />
          <rect x="245" :y="antenna.cursorY + 16" width="20" height="5" rx="2.5" fill="#4573F4" />
          <rect x="253.5" :y="antenna.cursorY - 15" width="1.6" height="26" rx=".8" fill="#fff" opacity=".55" />
        </g>
      </g>
    </template>

    <template #front>
      <g
        v-for="letter in frontLetters"
        :key="letter.key"
        class="nat-letters__letter"
        :transform="letter.transform"
        :opacity="letter.opacity"
        :style="{ '--letter-color': letter.color }"
      >
        <text class="nat-letters__text" text-anchor="middle" dominant-baseline="central" :fill="letter.color">{{ letter.char }}</text>
      </g>
    </template>
  </NatRobot>
</template>

<script setup lang="ts">
import { computed, shallowRef, useId } from 'vue'
import NatRobot from '../NatRobot.vue'
import NatAntennaCap from '../parts/NatAntennaCap.vue'
import { createSeededRandom } from '../../lib'
import { createSpring, idleSway, kickSpring, MAX_SPRING_DT_S, RAD_TO_DEG, stepSpring } from '../lib/spring'
import { useFrameLoop } from '../lib/useFrameLoop'

const CENTER = { x: 255, y: 280.5 }
const PHRASES = ['WELL DONE', 'GREAT JOB', 'YOU CAN DO IT', 'NEVER GIVE UP', 'KEEP GOING', 'I BELIEVE IN YOU', 'YOU ARE A STAR', 'STEP BY STEP']
// Букв вокруг Ната хватает на самую длинную фразу; первые сразу складываются в первые фразы
const LETTER_COUNT = 22
const START_LETTERS = 'WELLDONEGREATJOBYOUCAN'
const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'
const COLORS = ['#4573F4', '#5BA339', '#E98D34']
const RANDOM_SEED = 3
const HOLD_S = 4
const PHRASE_Y = 500
const SLOT_WIDTH = 46
const LINE_HEIGHT = 58
const MAX_LINE_LENGTH = 10
const ASSEMBLE_S = 0.85
const SCATTER_S = 1.1
const FLIP_S = 0.35
const LETTER_DELAY_S = 0.05
const MAX_DT_S = 0.05
const JOY_SPEED = 2
const JOY_DURATION_MS = 3200
const SPEED_EASING = 0.03
const ANTENNA_SWING_DEG = 40
const ANTENNA_LENGTH = 64
const ANTENNA_PUSH = 4
const ANTENNA_IDLE_SWAY = 0.07
const ANTENNA_FLASH_DECAY = 0.3
const TYPING_S = 1.4
const KEY_PRESS_S = 0.12
const KEY_PRESS_SQUASH = 0.6
const CURSOR_BLINK_S = 0.53

interface Letter {
  key: number
  color: string
  char: string
  nextChar: string | null
  angle: number
  rx: number
  ry: number
  tilt: number
  angularSpeed: number
  spin: number
  // 0 — на орбите, 1 — во фразе
  blend: number
  target: { x: number, y: number } | null
  slot: number
  delay: number
  flip: number
}

interface Slot {
  char: string
  x: number
  y: number
}

const uid = useId()
const ids = {
  cursorHalo: `${uid}-cursor-halo`,
}

const random = createSeededRandom(RANDOM_SEED)
const letters: Letter[] = Array.from({ length: LETTER_COUNT }, (_, i) => ({
  key: i,
  color: COLORS[i % COLORS.length]!,
  char: START_LETTERS[i] ?? ALPHABET[Math.floor(random() * ALPHABET.length)]!,
  nextChar: null,
  angle: i / LETTER_COUNT * 2 * Math.PI,
  rx: 205 + random() * 60,
  ry: 55 + random() * 45,
  tilt: (random() - 0.5) * 50,
  angularSpeed: (0.22 + random() * 0.18) * (i % 2 ? 1 : -1),
  spin: (random() - 0.5) * 30,
  blend: 0,
  target: null,
  slot: -1,
  delay: 0,
  flip: 1,
}))

// Длинная фраза делится на две строки по словам как можно ровнее, чтобы не оставалось одно слово «сиротой»
function splitLines(phrase: string) {
  if (phrase.length <= MAX_LINE_LENGTH) return [phrase]
  const words = phrase.split(' ')
  let best = Infinity
  let lines = [phrase]
  for (let i = 1; i < words.length; i++) {
    const first = words.slice(0, i).join(' ')
    const second = words.slice(i).join(' ')
    const longest = Math.max(first.length, second.length)
    if (longest < best) {
      best = longest
      lines = [first, second]
    }
  }
  return lines
}

function layout(phrase: string): Slot[] {
  return splitLines(phrase).flatMap((line, row) => [...line].flatMap((char, col) => {
    if (char === ' ') return []
    return [{ char, x: CENTER.x + (col - (line.length - 1) / 2) * SLOT_WIDTH, y: PHRASE_Y + row * LINE_HEIGHT }]
  }))
}

const spring = createSpring()
let phraseIndex = -1
let holdUntil = -1
let time = 0
let antennaTime = 0
let typingTime = -1
let speed = 1

// Для каждой буквы фразы берём свободную такую же, иначе любую — она перевернётся
function assemble() {
  phraseIndex = (phraseIndex + 1) % PHRASES.length
  const slots = layout(PHRASES[phraseIndex]!)
  const free = new Set(letters)
  const picks = slots.map((slot) => {
    const freeLetters = [...free]
    const letter = freeLetters.find((l) => l.char === slot.char) ?? freeLetters[Math.floor(Math.random() * freeLetters.length)]!
    free.delete(letter)
    return letter
  })
  for (const letter of free) {
    letter.target = null
    letter.slot = -1
  }
  picks.forEach((letter, i) => {
    const slot = slots[i]!
    letter.slot = i
    letter.target = { x: slot.x, y: slot.y }
    letter.delay = i * LETTER_DELAY_S
    if (letter.char !== slot.char) {
      letter.nextChar = slot.char
      letter.flip = 0
    }
  })
  holdUntil = time + HOLD_S + 1
  typingTime = 0
}

function easeInOut(x: number) {
  return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2
}

function stepLetter(letter: Letter, dt: number) {
  letter.angle += dt * letter.angularSpeed * speed
  if (letter.target) {
    letter.delay -= dt
    if (letter.delay <= 0) letter.blend = Math.min(1, letter.blend + dt / ASSEMBLE_S)
  } else {
    letter.blend = Math.max(0, letter.blend - dt / SCATTER_S)
  }
  if (letter.flip < 1) {
    letter.flip = Math.min(1, letter.flip + dt / FLIP_S)
    if (letter.flip >= 0.5 && letter.nextChar) {
      letter.char = letter.nextChar
      letter.nextChar = null
    }
  }
}

function calcLetter(letter: Letter) {
  const rad = letter.tilt / RAD_TO_DEG
  const ex = letter.rx * Math.cos(letter.angle)
  const ey = letter.ry * Math.sin(letter.angle)
  const depth = Math.sin(letter.angle)
  const orbitX = CENTER.x + ex * Math.cos(rad) - ey * Math.sin(rad)
  const orbitY = CENTER.y + 10 + ex * Math.sin(rad) + ey * Math.cos(rad)
  const k = easeInOut(letter.blend)
  let x = orbitX
  let y = orbitY
  if (letter.target || letter.blend > 0) {
    const targetX = letter.target ? letter.target.x : orbitX
    const targetY = letter.target ? letter.target.y : orbitY
    const hop = letter.slot >= 0 && letter.blend === 1 ? -9 * Math.max(0, Math.sin(time * 6 - letter.slot * 0.5)) : 0
    x = orbitX + (targetX - orbitX) * k
    y = orbitY + (targetY + hop - orbitY) * k
  }
  const flipScale = letter.flip < 1 ? Math.abs(1 - 2 * letter.flip) || 0.02 : 1
  const scale = (0.66 + 0.26 * depth) * (1 - k) + 1.05 * k
  const rotation = letter.spin * Math.sin(time * 0.8 + letter.angle) * (1 - k)
  return {
    key: letter.key,
    char: letter.char,
    color: letter.color,
    transform: `translate(${x.toFixed(1)} ${y.toFixed(1)}) rotate(${rotation.toFixed(1)}) scale(${(scale * flipScale).toFixed(3)} ${scale.toFixed(3)})`,
    opacity: (k > 0 ? 0.75 + 0.25 * k : 0.6 + 0.4 * depth).toFixed(2),
    isFront: k > 0.3 || depth > 0,
  }
}

function stepAntenna(dt: number) {
  antennaTime += dt
  if (typingTime >= 0) {
    const previous = typingTime
    typingTime += dt
    const isTyping = previous < TYPING_S
    if (isTyping && Math.floor(typingTime / KEY_PRESS_S) !== Math.floor(previous / KEY_PRESS_S)) spring.stretchVelocity -= KEY_PRESS_SQUASH
    if (typingTime >= TYPING_S && previous < TYPING_S) spring.flash = 1
    if (typingTime > TYPING_S) typingTime = -1
  }
  stepSpring(spring, dt, idleSway(antennaTime, 0, ANTENNA_IDLE_SWAY), ANTENNA_FLASH_DECAY)
}

function calcAntenna() {
  const tip = 137 - ANTENNA_LENGTH * spring.stretch
  const isTyping = typingTime >= 0 && typingTime < TYPING_S
  return {
    angle: spring.angle,
    tip,
    cursorY: tip - 20,
    haloRadius: (22 + spring.flash * 18).toFixed(1),
    haloOpacity: (0.25 + spring.flash * 0.75).toFixed(2),
    isCursorOn: isTyping || spring.flash > 0.2 || Math.floor(antennaTime / CURSOR_BLINK_S) % 2 === 0,
  }
}

const letterViews = shallowRef(letters.map(calcLetter))
const antenna = shallowRef(calcAntenna())
const backLetters = computed(() => letterViews.value.filter((letter) => !letter.isFront))
const frontLetters = computed(() => letterViews.value.filter((letter) => letter.isFront))

const { requestFrame } = useFrameLoop((rawDt) => {
  const dt = Math.min(rawDt, MAX_DT_S)
  time += dt
  if (holdUntil > 0 && time > holdUntil) {
    for (const letter of letters) {
      letter.target = null
      letter.slot = -1
    }
    holdUntil = -1
  }
  for (const letter of letters) stepLetter(letter, dt)
  speed += (1 - speed) * SPEED_EASING
  stepAntenna(Math.min(rawDt, MAX_SPRING_DT_S))
  letterViews.value = letters.map(calcLetter)
  antenna.value = calcAntenna()
})

function onPress() {
  speed = JOY_SPEED
  assemble()
  kickSpring(spring, ANTENNA_PUSH, 0)
  requestFrame()
}
</script>

<style scoped lang="scss">
.nat-letters {
  &__letter {
    filter: drop-shadow(0 0 7px var(--letter-color));
  }

  &__text {
    font-family: var(--font-display);
    font-size: 40px;
    font-weight: 700;
    paint-order: stroke;
    stroke: #fff;
    stroke-opacity: 0.45;
    stroke-width: 1.6px;
  }
}
</style>
