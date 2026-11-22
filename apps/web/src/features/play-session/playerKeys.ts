import type { InjectionKey, Ref } from 'vue'
import type { GameSoundName, IntroEntrance, QuestionSwap } from '@/entities/intro-theme'

// Элемент, который листает игру внутри проигрывателя; без проигрывателя игра листает window
export const PLAYER_SCROLL_KEY: InjectionKey<Readonly<Ref<HTMLElement | null>>> = Symbol('player-scroll')

// Место таймера в проигрывателе (полоса на телефоне, колонка на широком экране).
// attach сообщает проигрывателю, что таймер показан, и возвращает функцию отмены
export type PlayerTimerSlot = {
  target: Readonly<Ref<HTMLElement | null>>
  attach: () => () => void
}

export const PLAYER_TIMER_SLOT_KEY: InjectionKey<PlayerTimerSlot> = Symbol('player-timer-slot')

// Вылет первого вопроса у темы кодом (ADR 0015). framed — у темы рамка вокруг вопроса (на всех вопросах);
// take отдаёт вылет один раз за запуск проигрывателя, дальше null
export type PlayerEntrance = {
  framed: boolean
  take: () => IntroEntrance | null
  // Смена вопроса в игре: своя у темы кодом, перелистывание у остальных
  swap?: () => QuestionSwap | null
}

export const PLAYER_ENTRANCE_KEY: InjectionKey<PlayerEntrance> = Symbol('player-entrance')

// Звуки ответа (выбор, верно, неверно) — из набора темы; без темы или звука — тишина
export const PLAYER_SOUND_KEY: InjectionKey<(name: GameSoundName) => void> = Symbol('player-sound')

// true — открыто окно «Как играть»: игра ставит таймер на паузу
export const PLAYER_PAUSE_KEY: InjectionKey<Readonly<Ref<boolean>>> = Symbol('player-pause')

// true — слот не держит прокрутку: игра закончена (итог, ошибка), страница доезжает до подвала
export const PLAYER_SCROLL_RELEASE_KEY: InjectionKey<Ref<boolean>> = Symbol('player-scroll-release')
