import type { QuestionSwap } from '../types'

// Перелистывание для тем без своей смены вопроса: новый вопрос приходит справа и проясняется.
// При reduced motion — только проявление. Web Animations API, без GSAP
const ENTER_MS = 260
const FADE_MS = 150
const SHIFT_PX = 40
const BLUR_PX = 6

export function createSlideSwap(reducedMotion: boolean): QuestionSwap {
  let active: Animation | null = null

  function cancel(): void {
    active?.cancel()
    active = null
  }

  async function enter({ card }: { card: HTMLElement }): Promise<void> {
    cancel()
    if (typeof card.animate !== 'function') return
    const frames = reducedMotion
      ? [{ opacity: 0 }, { opacity: 1 }]
      : [
          { opacity: 0, transform: `translateX(${SHIFT_PX}px)`, filter: `blur(${BLUR_PX}px)` },
          { opacity: 1, transform: 'translateX(0)', filter: 'blur(0)' },
        ]
    const animation = card.animate(frames, { duration: reducedMotion ? FADE_MS : ENTER_MS, easing: 'ease-out' })
    active = animation
    try {
      await animation.finished
    } catch {
      // Анимацию отменили — конечное состояние и так на месте
    } finally {
      if (active === animation) active = null
    }
  }

  return { enter, cancel }
}
