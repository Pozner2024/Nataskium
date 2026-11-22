import { findTheme } from './catalog'
import { createFadeEntrance } from './entrances/fadeEntrance'
import { createSlideSwap } from './entrances/slideSwap'
import type { IntroEntrance, IntroSound, QuestionSwap } from './types'
import { createNataskiumEntrance } from './nataskium/entrance'
import { createNataskiumSound } from './nataskium/sound'
import { createNataskiumSwap } from './nataskium/swap'

// Вылет первого вопроса для темы. stage — корень проигрывателя: в нём рисуется сигнал над скримом.
// При reduced motion — плавное проявление без движения и без звука. null — у темы нет своего вылета
// (общий вылет тем-роликов появится вместе с первым роликом, ADR 0015)
export function createIntroEntrance(
  themeKey: string | null | undefined,
  stage: HTMLElement,
  reducedMotion: boolean,
  sound: IntroSound | null,
): IntroEntrance | null {
  const theme = findTheme(themeKey)
  if (theme.kind !== 'code') return null
  return reducedMotion ? createFadeEntrance() : createNataskiumEntrance(stage, theme.tone, sound)
}

// Смена вопроса: у темы Nataskium своя (импульс по рамке со звуком), у остальных тем и без темы — перелистывание.
// При reduced motion — только проявление
export function createQuestionSwap(themeKey: string | null | undefined, reducedMotion: boolean, sound: IntroSound | null): QuestionSwap {
  if (!themeKey || reducedMotion) return createSlideSwap(reducedMotion)
  const theme = findTheme(themeKey)
  return theme.kind === 'code' ? createNataskiumSwap(theme.tone, sound) : createSlideSwap(false)
}

// Звуки темы кодом; у тем без своих звуков — null
export function createIntroSound(themeKey: string | null | undefined): IntroSound | null {
  return findTheme(themeKey).kind === 'code' ? createNataskiumSound() : null
}
