import type { gsap as Gsap } from 'gsap'
import type { IntroSoundName } from '../types'
import { LETTER_CENTERS_VIEW, letterRevealProgress, type IntroLayout } from './layout'

type Gsap = typeof Gsap
type Timeline = ReturnType<Gsap['timeline']>
type Letter = keyof typeof LETTER_CENTERS_VIEW

export type SceneElements = {
  pcb: Element
  logo: Element
  robot: Element
  head: Element
  antenna: Element
  leftEye: Element
  rightEye: Element
  idot: Element
  letters: Record<Letter, Element>
  outlines: Record<Letter, Element>
}

// Тайминги перенесены 1:1 из прототипа hyperframes-lab/work/brand-intro/compositions/brand.html (секунды)
const PCB_FADE = { at: 0, duration: 1.2 }
const HEAD_APPEAR = { at: 0.5, duration: 0.75, fromScale: 0.55 }
const ANTENNA_POP = { at: 1.2, duration: 0.4 }
const EYES_OPEN = { left: 1.5, right: 1.56, duration: 0.24 }
const EYE_LOOK_SHIFT = 18
const LOOK_LEFT = { left: 2.0, right: 2.04, duration: 0.25 }
const LOOK_RIGHT = { left: 2.4, right: 2.44, duration: 0.3 }
const LOGO_SHRINK = { at: 2.8, duration: 0.5 }
const ROBOT_AWAY = { at: 3.05, duration: 0.5 }
const RIDE = { at: 3.55, duration: 1.0, ease: 'power2.inOut' }
const EYES_FORWARD_DURATION = 0.3
const OUTLINE = { duration: 0.3, fadeAfter: 0.28, fadeDuration: 0.35 }
const LETTER_FILL = { after: 0.12, duration: 0.4, fromScale: 0.92 }
const N_AFTER_LANDING = 0.05
const I_DOT = { afterLanding: 0.35, duration: 0.35 }
const BLINK = { afterLanding: 0.65, close: 0.07, open: 0.11, closedScale: 0.1 }
const LOGO_FADE = { at: 5.8, duration: 0.45, toScale: 0.94 }
const RIGHT_LETTERS: Letter[] = ['t', 'a', 's', 'k', 'i', 'u', 'm']
// Глаза поворачиваются влево чуть раньше, чем робот трогается в обратный путь
const LOOK_BACK_LEAD = 0.1
// Шагов деления пополам при поиске момента на кривой плавности: точность 1/2^30 пути, с запасом
const EASE_SEARCH_STEPS = 30

// Время, когда робот на обратном пути проходит долю пути progress (обратная функция к плавности проезда)
function rideTimeAt(gsap: Gsap, progress: number): number {
  const ease = gsap.parseEase(RIDE.ease)
  let low = 0
  let high = 1
  for (let step = 0; step < EASE_SEARCH_STEPS; step++) {
    const middle = (low + high) / 2
    if (ease(middle) < progress) low = middle
    else high = middle
  }
  return RIDE.at + RIDE.duration * high
}

type Cue = (name: IntroSoundName) => void

function revealLetter(tl: Timeline, letter: Element, outline: Element, at: number, cue: Cue) {
  // pathLength="1" у обводки: длина в долях, без getTotalLength
  tl.fromTo(outline, { opacity: 1, strokeDashoffset: 1 }, { strokeDashoffset: 0, duration: OUTLINE.duration, ease: 'power2.out', immediateRender: false }, at)
  tl.to(outline, { opacity: 0, duration: OUTLINE.fadeDuration, ease: 'power2.in' }, at + OUTLINE.fadeAfter)
  tl.fromTo(
    letter,
    { opacity: 0, scale: LETTER_FILL.fromScale, transformOrigin: '50% 100%' },
    { opacity: 1, scale: 1, duration: LETTER_FILL.duration, ease: 'expo.out' },
    at + LETTER_FILL.after,
  )
  tl.call(cue, ['letter'], at + LETTER_FILL.after)
}

// cue — звук к событию анимации (набор темы); без звука — пустая функция
export function buildIntroTimeline(gsap: Gsap, el: SceneElements, layout: IntroLayout, cue: Cue = () => {}): Timeline {
  const { leftEye, rightEye } = el
  const eyes = [leftEye, rightEye]
  const origin = `${layout.headRest.x - layout.logo.left}px ${layout.headRest.y - layout.logo.top}px`
  const landed = RIDE.at + RIDE.duration

  gsap.set(el.logo, { transformOrigin: origin, x: layout.heroShift.x, y: layout.heroShift.y, scale: layout.heroScale })
  gsap.set([...Object.values(el.letters), el.idot, el.head, el.antenna], { opacity: 0 })
  gsap.set(eyes, { scaleY: 0, transformOrigin: '50% 50%' })
  gsap.set(el.logo, { visibility: 'visible' })

  const tl = gsap.timeline({ paused: true })

  tl.fromTo(el.pcb, { opacity: 0 }, { opacity: 1, duration: PCB_FADE.duration, ease: 'power2.out' }, PCB_FADE.at)
  tl.fromTo(
    el.head,
    { opacity: 0, scale: HEAD_APPEAR.fromScale, transformOrigin: '50% 50%' },
    { opacity: 1, scale: 1, duration: HEAD_APPEAR.duration, ease: 'expo.out' },
    HEAD_APPEAR.at,
  )
  tl.call(cue, ['head'], HEAD_APPEAR.at)
  tl.fromTo(el.antenna, { opacity: 1, scale: 0, transformOrigin: '50% 100%' }, { opacity: 1, scale: 1, duration: ANTENNA_POP.duration, ease: 'back.out(2.2)' }, ANTENNA_POP.at)
  tl.call(cue, ['antenna'], ANTENNA_POP.at)
  tl.to(leftEye, { scaleY: 1, duration: EYES_OPEN.duration, ease: 'back.out(2)' }, EYES_OPEN.left)
  tl.to(rightEye, { scaleY: 1, duration: EYES_OPEN.duration, ease: 'back.out(2)' }, EYES_OPEN.right)
  tl.call(cue, ['eye'], EYES_OPEN.left)
  tl.call(cue, ['eye'], EYES_OPEN.right)
  tl.to(leftEye, { x: -EYE_LOOK_SHIFT, duration: LOOK_LEFT.duration, ease: 'power2.out' }, LOOK_LEFT.left)
  tl.to(rightEye, { x: -EYE_LOOK_SHIFT, duration: LOOK_LEFT.duration, ease: 'power2.out' }, LOOK_LEFT.right)
  tl.to(leftEye, { x: EYE_LOOK_SHIFT, duration: LOOK_RIGHT.duration, ease: 'power2.inOut' }, LOOK_RIGHT.left)
  tl.to(rightEye, { x: EYE_LOOK_SHIFT, duration: LOOK_RIGHT.duration, ease: 'power2.inOut' }, LOOK_RIGHT.right)

  // Лого уменьшается раньше, чем робот трогается вправо: иначе крупная голова выезжает за край узкого кадра
  tl.to(el.logo, { x: 0, y: 0, scale: 1, duration: LOGO_SHRINK.duration, ease: 'power3.inOut' }, LOGO_SHRINK.at)
  tl.fromTo(el.robot, { x: 0 }, { x: layout.robotFarOffset, duration: ROBOT_AWAY.duration, ease: 'power3.inOut' }, ROBOT_AWAY.at)
  tl.to(eyes, { x: -EYE_LOOK_SHIFT, duration: LOOK_LEFT.duration, ease: 'power2.inOut' }, RIDE.at - LOOK_BACK_LEAD)
  tl.to(el.robot, { x: 0, duration: RIDE.duration, ease: RIDE.ease }, RIDE.at)
  tl.to(eyes, { x: 0, duration: EYES_FORWARD_DURATION, ease: 'power2.inOut' }, landed)

  for (const letter of RIGHT_LETTERS) {
    const progress = letterRevealProgress(LETTER_CENTERS_VIEW[letter], layout.robotFarOffset)
    revealLetter(tl, el.letters[letter], el.outlines[letter], rideTimeAt(gsap, progress), cue)
  }
  revealLetter(tl, el.letters.n, el.outlines.n, landed + N_AFTER_LANDING, cue)
  tl.fromTo(el.idot, { opacity: 1, scale: 0, transformOrigin: '50% 50%' }, { opacity: 1, scale: 1, duration: I_DOT.duration, ease: 'back.out(2.5)' }, landed + I_DOT.afterLanding)
  tl.call(cue, ['dot'], landed + I_DOT.afterLanding)
  tl.to(eyes, { scaleY: BLINK.closedScale, duration: BLINK.close, ease: 'power2.in' }, landed + BLINK.afterLanding)
  tl.to(eyes, { scaleY: 1, duration: BLINK.open, ease: 'power2.out' }, landed + BLINK.afterLanding + BLINK.close)

  tl.to(el.logo, { opacity: 0, scale: LOGO_FADE.toScale, duration: LOGO_FADE.duration, ease: 'power2.in' }, LOGO_FADE.at)
  tl.addLabel('clean', LOGO_FADE.at + LOGO_FADE.duration)
  return tl
}
