import type { IntroThemeKey } from '@nataskium/shared/schemas'

export type { IntroThemeKey } from '@nataskium/shared/schemas'

// code — интро рисуется Vue-компонентом, video — ролик (ADR 0015)
export type IntroThemeKind = 'code' | 'video'

// Тон выбирает палитру игры --g-* (ADR 0014)
export type IntroThemeTone = 'dark' | 'light'

// Элементы первого вопроса для вылета: карточка (рамка рисуется по её краю), точки окна и элементы по порядку появления
export type IntroEntranceTargets = {
  card: HTMLElement
  dots: HTMLElement | null
  items: HTMLElement[]
  // Граница дорожки сверху: элемент над карточкой (по его низу) или блок, содержащий карточку (по его верху)
  ceiling: HTMLElement | null
  // Начальное состояние вылета выставлено: карточку можно показывать без мигания готового вопроса
  onReady: () => void
}

// Звуки темы кодом (ADR 0015): набор коротких звуков к событиям анимации
export type IntroSoundName = 'head' | 'antenna' | 'eye' | 'letter' | 'dot' | 'signal' | 'frame' | 'answer' | 'swap' | GameSoundName

// Звуки ответа в игре: выбор варианта, верный и неверный ответ
export type GameSoundName = 'select' | 'correct' | 'wrong'

export type IntroSound = {
  unlock: () => void
  play: (name: IntroSoundName) => void
  setMuted: (muted: boolean) => void
  stop: () => void
  dispose: () => void
}

// Вылет первого вопроса у темы кодом (ADR 0015). cancel — сразу конечное состояние (размонтирование)
export type IntroEntrance = {
  run: (targets: IntroEntranceTargets) => Promise<void>
  cancel: () => void
}

// Смена вопроса в игре: содержимое карточки обновляется на месте (фокус не теряется), новое появляется анимацией.
// Своя у темы кодом, общая у остальных
export type QuestionSwap = {
  enter: (targets: { card: HTMLElement; items: HTMLElement[] }) => Promise<void>
}

export type IntroThemeEntry = {
  key: IntroThemeKey
  kind: IntroThemeKind
  tone: IntroThemeTone
  nameKey: string
  // Полупрозрачная подложка под стартовой карточкой и «Пропустить»: для светлых и пёстрых кадров, где текст темы теряется
  startScrim: boolean
}
