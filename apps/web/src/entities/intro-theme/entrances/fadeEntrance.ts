import type { IntroEntrance } from '../types'

const FADE_MS = 300

// Вылет при prefers-reduced-motion (ADR 0015): без движения, карточка вопроса плавно проявляется.
// Проявление только визуальное: вопрос сразу считается приземлившимся (нажимается, фокус и таймер не ждут).
// Web Animations API без GSAP; где его нет — сразу конечное состояние
export function createFadeEntrance(): IntroEntrance {
  let animation: Animation | null = null

  async function run({ card, onReady }: Parameters<IntroEntrance['run']>[0]): Promise<void> {
    onReady()
    if (typeof card.animate === 'function') {
      animation = card.animate([{ opacity: 0 }, { opacity: 1 }], { duration: FADE_MS, easing: 'ease-out' })
    }
  }

  return { run, cancel: () => animation?.finish() }
}
