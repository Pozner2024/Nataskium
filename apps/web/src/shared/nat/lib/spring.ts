const ANGLE_STIFFNESS = 42
const ANGLE_DAMPING = 3.2
const STRETCH_STIFFNESS = 90
const STRETCH_DAMPING = 6
const MIN_STRETCH = 0.6
const MAX_STRETCH = 1.35
const IDLE_SWAY = 0.09
const IDLE_SWAY_RATE = 1.4
const DEFAULT_FLASH_DECAY = 0.25
const DEFAULT_PUSH = 5
const DEFAULT_SQUASH = 3.2

export const MAX_SPRING_DT_S = 0.033
export const RAD_TO_DEG = 180 / Math.PI

export interface Spring {
  angle: number
  angularVelocity: number
  stretch: number
  stretchVelocity: number
  flash: number
}

export function createSpring(): Spring {
  return { angle: 0, angularVelocity: 0, stretch: 1, stretchVelocity: 0, flash: 0 }
}

export function idleSway(time: number, phase = 0, amplitude = IDLE_SWAY) {
  return amplitude * Math.sin(time * IDLE_SWAY_RATE + phase)
}

export function stepSpring(spring: Spring, dt: number, idleAngle: number, flashDecay = DEFAULT_FLASH_DECAY) {
  spring.angularVelocity += (-ANGLE_STIFFNESS * (spring.angle - idleAngle) - ANGLE_DAMPING * spring.angularVelocity) * dt
  spring.angle += spring.angularVelocity * dt
  spring.stretchVelocity += (-STRETCH_STIFFNESS * (spring.stretch - 1) - STRETCH_DAMPING * spring.stretchVelocity) * dt
  spring.stretch = Math.max(MIN_STRETCH, Math.min(MAX_STRETCH, spring.stretch + spring.stretchVelocity * dt))
  spring.flash *= Math.pow(flashDecay, dt)
}

export function kickSpring(spring: Spring, push = DEFAULT_PUSH, squash = DEFAULT_SQUASH) {
  spring.angularVelocity += (Math.random() < 0.5 ? -1 : 1) * push
  spring.stretchVelocity -= squash
}

export function zigzag(x: number, fromY: number, toY: number, loops: number, amplitude: number) {
  const step = (fromY - toY) / (loops * 2)
  let d = `M${x} ${fromY}`
  for (let i = 0; i < loops * 2; i++) {
    const side = i % 2 ? -1 : 1
    d += ` Q${x + side * amplitude} ${fromY - step * (i + 0.5)} ${x} ${fromY - step * (i + 1)}`
  }
  return d
}
