// Звуки синтезируются на лету через Web Audio — без файлов и библиотек
const MASTER_VOLUME = 0.5
const SILENCE = 0.0001
const CLICK_LENGTH_S = 0.012

// Щелчки храповика редеют вместе с замедлением шестерёнок после нажатия
const GEAR_DURATION_S = 0.8
const GEAR_FIRST_CLICK_GAP_S = 0.025
const GEAR_CLICK_GAP_GROWTH = 1.15
const GEAR_CLICK_FILTER_HZ = 3200
const GEAR_CLICK_VOLUME = 0.35
const WHIRR_START_HZ = 150
const WHIRR_END_HZ = 55
const WHIRR_FILTER_HZ = 600
const WHIRR_VOLUME = 0.12

const SWITCH_FILTER_HZ = 1800
const SWITCH_VOLUME = 0.5
const BULB_ON_NOTES = [
  { delayS: 0.03, frequencyHz: 1046.5 },
  { delayS: 0.11, frequencyHz: 1568 },
]
const BULB_NOTE_VOLUME = 0.18
const BULB_NOTE_DURATION_S = 0.6
const BULB_OFF_START_HZ = 660
const BULB_OFF_END_HZ = 330
const BULB_OFF_DELAY_S = 0.02
const BULB_OFF_DURATION_S = 0.25
const BULB_OFF_VOLUME = 0.12

// «Поп» — быстрый взлёт тона, как лопнувший пузырь
const POP_START_HZ = 250
const POP_END_HZ = 800
const POP_DURATION_S = 0.07
const POP_VOLUME = 0.4
const CHIRP_DELAY_S = 0.1
const CHIRP_START_HZ = 1400
const CHIRP_END_HZ = 2100
const CHIRP_DURATION_S = 0.12
const CHIRP_VOLUME = 0.15

let context: AudioContext | null = null
let clickBuffer: AudioBuffer | null = null

function getContext() {
  if (typeof window === 'undefined' || !('AudioContext' in window)) return null
  context ??= new AudioContext()
  // Браузер разрешает звук только после действия пользователя — все звуки Ната играют по нажатию.
  // Кроме suspended бывает interrupted (iOS Safari после звонка); без звука Нат просто молчит
  if (context.state !== 'running') context.resume().catch(() => {})
  return context
}

function createMaster(ctx: AudioContext) {
  const master = new GainNode(ctx, { gain: MASTER_VOLUME })
  master.connect(ctx.destination)
  return master
}

function createClickBuffer(ctx: AudioContext) {
  const length = Math.round(ctx.sampleRate * CLICK_LENGTH_S)
  const buffer = ctx.createBuffer(1, length, ctx.sampleRate)
  const data = buffer.getChannelData(0)
  for (let i = 0; i < length; i++) {
    data[i] = (Math.random() * 2 - 1) * (1 - i / length) ** 2
  }
  return buffer
}

function playClick(ctx: AudioContext, output: AudioNode, time: number, volume: number) {
  clickBuffer ??= createClickBuffer(ctx)
  const source = new AudioBufferSourceNode(ctx, { buffer: clickBuffer })
  const gain = new GainNode(ctx, { gain: volume })
  source.connect(gain).connect(output)
  source.start(time)
}

function playTone(ctx: AudioContext, output: AudioNode, start: number, duration: number, from: number, to: number, volume: number) {
  const end = start + duration
  const oscillator = new OscillatorNode(ctx, { type: 'sine', frequency: from })
  const gain = new GainNode(ctx, { gain: SILENCE })

  oscillator.frequency.setValueAtTime(from, start)
  oscillator.frequency.exponentialRampToValueAtTime(to, end)
  gain.gain.setValueAtTime(volume, start)
  gain.gain.exponentialRampToValueAtTime(SILENCE, end)

  oscillator.connect(gain).connect(output)
  oscillator.start(start)
  oscillator.stop(end)
}

function playSwitchClick(ctx: AudioContext, output: AudioNode, time: number) {
  const filter = new BiquadFilterNode(ctx, { type: 'bandpass', frequency: SWITCH_FILTER_HZ })
  filter.connect(output)
  playClick(ctx, filter, time, SWITCH_VOLUME)
}

function playRatchet(ctx: AudioContext, output: AudioNode, start: number) {
  const filter = new BiquadFilterNode(ctx, { type: 'bandpass', frequency: GEAR_CLICK_FILTER_HZ })
  filter.connect(output)

  let time = 0
  let gap = GEAR_FIRST_CLICK_GAP_S
  while (time < GEAR_DURATION_S) {
    playClick(ctx, filter, start + time, GEAR_CLICK_VOLUME * (1 - time / GEAR_DURATION_S))
    time += gap
    gap *= GEAR_CLICK_GAP_GROWTH
  }
}

function playWhirr(ctx: AudioContext, output: AudioNode, start: number) {
  const end = start + GEAR_DURATION_S
  const oscillator = new OscillatorNode(ctx, { type: 'sawtooth', frequency: WHIRR_START_HZ })
  const filter = new BiquadFilterNode(ctx, { type: 'lowpass', frequency: WHIRR_FILTER_HZ })
  const gain = new GainNode(ctx, { gain: WHIRR_VOLUME })

  oscillator.frequency.exponentialRampToValueAtTime(WHIRR_END_HZ, end)
  gain.gain.setValueAtTime(WHIRR_VOLUME, start)
  gain.gain.exponentialRampToValueAtTime(SILENCE, end)

  oscillator.connect(filter).connect(gain).connect(output)
  oscillator.start(start)
  oscillator.stop(end)
}

export function playGearSound() {
  const ctx = getContext()
  if (!ctx) return

  const master = createMaster(ctx)
  playRatchet(ctx, master, ctx.currentTime)
  playWhirr(ctx, master, ctx.currentTime)
}

export function playBulbOnSound() {
  const ctx = getContext()
  if (!ctx) return

  const master = createMaster(ctx)
  const start = ctx.currentTime
  playSwitchClick(ctx, master, start)
  for (const note of BULB_ON_NOTES) {
    playTone(ctx, master, start + note.delayS, BULB_NOTE_DURATION_S, note.frequencyHz, note.frequencyHz, BULB_NOTE_VOLUME)
  }
}

export function playBulbOffSound() {
  const ctx = getContext()
  if (!ctx) return

  const master = createMaster(ctx)
  const start = ctx.currentTime
  playSwitchClick(ctx, master, start)
  playTone(ctx, master, start + BULB_OFF_DELAY_S, BULB_OFF_DURATION_S, BULB_OFF_START_HZ, BULB_OFF_END_HZ, BULB_OFF_VOLUME)
}

export function playGreetingSound() {
  const ctx = getContext()
  if (!ctx) return

  const master = createMaster(ctx)
  const start = ctx.currentTime
  playTone(ctx, master, start, POP_DURATION_S, POP_START_HZ, POP_END_HZ, POP_VOLUME)
  playTone(ctx, master, start + CHIRP_DELAY_S, CHIRP_DURATION_S, CHIRP_START_HZ, CHIRP_END_HZ, CHIRP_VOLUME)
}
