import answerUrl from './sounds/answer.mp3?no-inline'
import antennaUrl from './sounds/antenna.mp3?no-inline'
import dotUrl from './sounds/dot.mp3?no-inline'
import eyeUrl from './sounds/eye.mp3?no-inline'
import frameUrl from './sounds/frame.mp3?no-inline'
import headUrl from './sounds/head.mp3?no-inline'
import letterUrl from './sounds/letter.mp3?no-inline'
import selectUrl from './sounds/select.mp3?no-inline'
import signalUrl from './sounds/signal.mp3?no-inline'
import swapUrl from './sounds/swap.mp3?no-inline'
import wrongUrl from './sounds/wrong.mp3?no-inline'
import type { IntroSound, IntroSoundName } from '../types'

// ?no-inline: файлы всегда отдельными адресами, не data:-URI (fetch подчиняется connect-src в CSP)
// Громкость каждого звука подобрана в прототипе hyperframes-lab (набор A, источники — sounds/SOURCES.md)
const SOUNDS: Record<IntroSoundName, { url: string; volume: number }> = {
  head: { url: headUrl, volume: 0.7 },
  antenna: { url: antennaUrl, volume: 0.45 },
  eye: { url: eyeUrl, volume: 0.35 },
  letter: { url: letterUrl, volume: 0.3 },
  dot: { url: dotUrl, volume: 0.6 },
  signal: { url: signalUrl, volume: 0.4 },
  frame: { url: frameUrl, volume: 0.5 },
  answer: { url: answerUrl, volume: 0.3 },
  // Смена вопроса звучит на каждом вопросе: короткий и тихий, почти фоном
  swap: { url: swapUrl, volume: 0.15 },
  select: { url: selectUrl, volume: 0.4 },
  correct: { url: dotUrl, volume: 0.6 },
  wrong: { url: wrongUrl, volume: 0.5 },
}

// Звуки темы через Web Audio: точный момент старта и общий выключатель.
// unlock вызывается в обработчике нажатия «Начать»: браузеры разрешают звук только после жеста пользователя
export function createNataskiumSound(): IntroSound {
  let context: AudioContext | null = null
  let master: GainNode | null = null
  let enabled = true
  let muted = false
  const buffers = new Map<IntroSoundName, AudioBuffer>()
  const playing = new Set<AudioBufferSourceNode>()

  async function load(name: IntroSoundName, audio: AudioContext): Promise<void> {
    try {
      const response = await fetch(SOUNDS[name].url)
      buffers.set(name, await audio.decodeAudioData(await response.arrayBuffer()))
    } catch {
      // Звук не загрузился — интро идёт без него
    }
  }

  function unlock(): void {
    if (context || typeof AudioContext === 'undefined') return
    context = new AudioContext()
    master = context.createGain()
    master.gain.value = muted ? 0 : 1
    master.connect(context.destination)
    void context.resume()
    for (const name of Object.keys(SOUNDS) as IntroSoundName[]) void load(name, context)
  }

  function play(name: IntroSoundName): void {
    const buffer = buffers.get(name)
    if (!enabled || !context || !master || !buffer) return
    const source = context.createBufferSource()
    const gain = context.createGain()
    gain.gain.value = SOUNDS[name].volume
    source.buffer = buffer
    source.connect(gain).connect(master)
    source.onended = () => playing.delete(source)
    playing.add(source)
    source.start()
  }

  function setMuted(value: boolean): void {
    muted = value
    if (master) master.gain.value = value ? 0 : 1
  }

  // «Пропустить»: звучащее в интро обрывается; звуки игры (смена вопроса, ответы) дальше работают
  function stop(): void {
    for (const source of playing) source.stop()
    playing.clear()
  }

  // Уход со страницы: звук больше не нужен
  function dispose(): void {
    stop()
    enabled = false
    void context?.close()
    context = null
  }

  return { unlock, play, setMuted, stop, dispose }
}
