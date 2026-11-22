import { loadGsap } from '../loadGsap'
import type { IntroSound, IntroThemeTone, QuestionSwap } from '../types'
import { ROUTE_COLORS, drawFrame } from './entrance'

// Смена вопроса в теме Nataskium: по рамке карточки пробегает импульс со звуком, новые элементы появляются по очереди — короче первого вылета, чтобы не утомлять на десятом вопросе
const PULSE = { duration: 0.55, length: 0.14, width: 4 }
const ITEMS = { at: 0.1, duration: 0.3, stagger: 0.05, fromY: 16 }
const LAND_EASE = 'back.out(1.4)'

export function createNataskiumSwap(tone: IntroThemeTone, sound: IntroSound | null): QuestionSwap {
  async function enter({ card, items }: { card: HTMLElement; items: HTMLElement[] }): Promise<void> {
    const cleanups: Array<() => void> = []
    try {
      const gsap = await loadGsap()
      const frame = drawFrame(card, tone)
      cleanups.push(() => frame.svg.remove())
      frame.rect.style.stroke = ROUTE_COLORS[tone].core
      frame.rect.setAttribute('stroke-width', String(PULSE.width))
      frame.rect.setAttribute('stroke-dasharray', `${PULSE.length} ${1 - PULSE.length}`)
      const context = gsap.context(() => {}, card)
      cleanups.push(() => context.revert())
      const pulse = { at: frame.share }
      sound?.play('swap')
      await new Promise<void>((resolve) => {
        context.add(() => {
          const tl = gsap.timeline({ onComplete: resolve })
          tl.to(
            pulse,
            {
              at: frame.share + 1,
              duration: PULSE.duration,
              ease: 'power1.inOut',
              onUpdate: () => frame.rect.setAttribute('stroke-dashoffset', String(-pulse.at)),
            },
            0,
          )
          tl.fromTo(items, { opacity: 0, y: ITEMS.fromY }, { opacity: 1, y: 0, duration: ITEMS.duration, ease: LAND_EASE, stagger: ITEMS.stagger }, ITEMS.at)
        })
      })
    } catch {
      // Без GSAP новое содержимое показывается сразу
    } finally {
      for (const cleanup of cleanups.reverse()) cleanup()
    }
  }

  return { enter }
}
