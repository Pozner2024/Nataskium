import { onMounted, onUnmounted } from 'vue'

interface FrameLoopOptions {
  isAlwaysOn?: boolean
}

// При prefers-reduced-motion сцена рисуется одним кадром; requestFrame() дорисовывает кадр после действия пользователя
export function useFrameLoop(onFrame: (dt: number) => void, options: FrameLoopOptions = {}) {
  let frameId = 0
  let lastFrame = 0
  let isReducedMotion = false

  function shouldLoop() {
    return options.isAlwaysOn || !isReducedMotion
  }

  function tick(now: number) {
    const dt = (now - lastFrame) / 1000
    lastFrame = now
    onFrame(dt)
    if (shouldLoop()) frameId = requestAnimationFrame(tick)
  }

  function requestFrame() {
    if (shouldLoop()) return
    cancelAnimationFrame(frameId)
    frameId = requestAnimationFrame((now) => {
      lastFrame = now
      tick(now)
    })
  }

  onMounted(() => {
    isReducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches
    lastFrame = performance.now()
    frameId = requestAnimationFrame(tick)
  })

  onUnmounted(() => cancelAnimationFrame(frameId))

  return {
    requestFrame,
    isReducedMotion: () => isReducedMotion,
  }
}
