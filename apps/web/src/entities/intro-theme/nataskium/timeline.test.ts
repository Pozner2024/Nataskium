import { gsap } from 'gsap'
import { describe, expect, it } from 'vitest'
import { introLayout } from './layout'
import { buildIntroTimeline, type SceneElements } from './timeline'

type Call = { kind: 'to' | 'fromTo' | 'call'; target: unknown; at: number; duration: number; args?: unknown[] }

const LETTERS = ['n', 't', 'a', 's', 'k', 'i', 'u', 'm'] as const
// Лого гаснет в 5.8 с (LOGO_FADE в timeline.ts): к этому моменту все буквы и точка над i уже залиты
const LOGO_FADE_AT = 5.8

const SIZES: Array<[string, number, number]> = [
  ['16:9 прототип', 1920, 1080],
  ['ноутбук', 1280, 720],
  ['планшет 4:3', 1024, 768],
  ['телефон 360', 360, 640],
  ['телефон 390', 390, 844],
  ['телефон прототип', 1080, 2000],
]

// Записывающий таймлайн: настоящая плавность (parseEase) из GSAP, вызовы складываются в список
function recordingGsap() {
  const calls: Call[] = []
  const labels: Record<string, number> = {}
  const sets: unknown[] = []
  let paused: unknown = null
  const timeline = {
    to: (target: unknown, vars: { duration?: number }, at: number) => (calls.push({ kind: 'to', target, at, duration: vars.duration ?? 0 }), timeline),
    fromTo: (target: unknown, _from: unknown, vars: { duration?: number }, at: number) =>
      (calls.push({ kind: 'fromTo', target, at, duration: vars.duration ?? 0 }), timeline),
    call: (callback: unknown, args: unknown[], at: number) => (calls.push({ kind: 'call', target: callback, at, duration: 0, args }), timeline),
    addLabel: (name: string, at: number) => ((labels[name] = at), timeline),
  }
  const fake = {
    parseEase: gsap.parseEase,
    set: (target: unknown) => sets.push(target),
    timeline: (vars: { paused?: boolean }) => ((paused = vars.paused), timeline),
  }
  return { fake: fake as unknown as typeof gsap, calls, labels, sets, paused: () => paused }
}

function sceneElements(): SceneElements {
  const element = (name: string) => ({ name }) as unknown as Element
  const byLetter = (prefix: string) => Object.fromEntries(LETTERS.map((letter) => [letter, element(prefix + letter)])) as SceneElements['letters']
  return {
    pcb: element('pcb'),
    logo: element('logo'),
    robot: element('robot'),
    head: element('head'),
    antenna: element('antenna'),
    leftEye: element('leftEye'),
    rightEye: element('rightEye'),
    idot: element('idot'),
    letters: byLetter('letter-'),
    outlines: byLetter('outline-'),
  }
}

function build(width: number, height: number) {
  const recorder = recordingGsap()
  const elements = sceneElements()
  const cues: Array<{ name: string; at: number }> = []
  buildIntroTimeline(recorder.fake, elements, introLayout(width, height))
  for (const call of recorder.calls) {
    if (call.kind === 'call') cues.push({ name: String(call.args?.[0]), at: call.at })
  }
  return { ...recorder, elements, cues }
}

function letterFillAt(calls: Call[], elements: SceneElements, letter: (typeof LETTERS)[number]): Call {
  return calls.find((call) => call.kind === 'fromTo' && call.target === elements.letters[letter])!
}

describe('buildIntroTimeline', () => {
  it('таймлайн создаётся на паузе: проигрыватель запускает его сам после раскладки', () => {
    expect(build(1920, 1080).paused()).toBe(true)
  })

  it('звуки в порядке прототипа: голова, антенна, два глаза, восемь букв, точка над i', () => {
    const { cues } = build(1920, 1080)
    const ordered = [...cues].sort((a, b) => a.at - b.at).map((cue) => cue.name)
    expect(ordered).toEqual(['head', 'antenna', 'eye', 'eye', ...Array(8).fill('letter'), 'dot'])
  })

  it('буквы tASKIUM заливаются справа налево, n — после возвращения робота', () => {
    const { calls, elements } = build(1920, 1080)
    const right = (['m', 'u', 'i', 'k', 's', 'a', 't'] as const).map((letter) => letterFillAt(calls, elements, letter).at)
    expect([...right].sort((a, b) => a - b)).toEqual(right)
    expect(letterFillAt(calls, elements, 'n').at).toBeGreaterThan(Math.max(...right))
  })

  it.each(SIZES)('%s: все буквы и точка над i залиты до того, как лого гаснет', (_name, width, height) => {
    const { calls, elements } = build(width, height)
    for (const letter of LETTERS) {
      const fill = letterFillAt(calls, elements, letter)
      expect(fill.at + fill.duration).toBeLessThanOrEqual(LOGO_FADE_AT)
    }
    const dot = calls.find((call) => call.kind === 'fromTo' && call.target === elements.idot)!
    expect(dot.at + dot.duration).toBeLessThanOrEqual(LOGO_FADE_AT)
  })

  it('метка clean — конец интро, после неё сцена пуста', () => {
    const { labels, calls } = build(1920, 1080)
    const end = Math.max(...calls.map((call) => call.at + call.duration))
    expect(labels.clean).toBeCloseTo(end, 5)
  })

  it('без звука (cue по умолчанию) таймлайн строится без ошибок', () => {
    expect(() => build(390, 844)).not.toThrow()
  })
})
