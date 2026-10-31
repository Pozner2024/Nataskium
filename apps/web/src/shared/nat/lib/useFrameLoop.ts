import { getCurrentInstance, onMounted, onUnmounted } from 'vue'

// Не чаще ~60 кадров в секунду: на экранах 120 Гц рисуем каждый второй такт, на 144 Гц — каждый второй (72),
// на 60 Гц — каждый. Запас в 4 мс, чтобы на 60 Гц из-за дрожания тактов не пропускать кадры
const MIN_FRAME_MS = 1000 / 60 - 4

interface FrameLoopOptions {
  isAlwaysOn?: boolean
}

// При prefers-reduced-motion сцена рисуется одним кадром; requestFrame() дорисовывает кадр после действия пользователя.
// Пока корневой элемент компонента за пределами экрана, цикл стоит на паузе
export function useFrameLoop(onFrame: (dt: number) => void, options: FrameLoopOptions = {}) {
  const instance = getCurrentInstance()
  let frameId = 0
  let lastFrame = 0
  let isReducedMotion = false
  let isVisible = true
  let observer: IntersectionObserver | undefined

  function isLooping() {
    return options.isAlwaysOn || !isReducedMotion
  }

  function tick(now: number) {
    const dt = (now - lastFrame) / 1000
    lastFrame = now
    onFrame(dt)
    if (isLooping() && isVisible) frameId = requestAnimationFrame(loop)
  }

  // Постоянный цикл пропускает слишком частые такты; разовый кадр из requestFrame() рисуется всегда
  function loop(now: number) {
    if (now - lastFrame < MIN_FRAME_MS) {
      frameId = requestAnimationFrame(loop)
      return
    }
    tick(now)
  }

  function start() {
    cancelAnimationFrame(frameId)
    lastFrame = performance.now()
    frameId = requestAnimationFrame(loop)
  }

  function requestFrame() {
    if (isLooping()) return
    cancelAnimationFrame(frameId)
    frameId = requestAnimationFrame((now) => {
      lastFrame = now
      tick(now)
    })
  }

  function onVisibilityChange([entry]: IntersectionObserverEntry[]) {
    if (!entry) return
    isVisible = entry.isIntersecting
    if (!isVisible) {
      cancelAnimationFrame(frameId)
      return
    }
    if (isLooping()) start()
    else requestFrame()
  }

  onMounted(() => {
    isReducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches
    start()

    const root: unknown = instance?.proxy?.$el
    if (!(root instanceof Element)) return
    observer = new IntersectionObserver(onVisibilityChange)
    observer.observe(root)
  })

  onUnmounted(() => {
    cancelAnimationFrame(frameId)
    observer?.disconnect()
  })

  return {
    requestFrame,
    isReducedMotion: () => isReducedMotion,
  }
}
