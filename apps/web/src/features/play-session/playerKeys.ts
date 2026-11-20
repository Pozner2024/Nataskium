import type { InjectionKey, Ref } from 'vue'

// Элемент, который листает игру внутри проигрывателя; без проигрывателя игра листает window
export const PLAYER_SCROLL_KEY: InjectionKey<Readonly<Ref<HTMLElement | null>>> = Symbol('player-scroll')

// Место таймера в проигрывателе (полоса на телефоне, колонка на широком экране).
// attach сообщает проигрывателю, что таймер показан, и возвращает функцию отмены
export type PlayerTimerSlot = {
  target: Readonly<Ref<HTMLElement | null>>
  attach: () => () => void
}

export const PLAYER_TIMER_SLOT_KEY: InjectionKey<PlayerTimerSlot> = Symbol('player-timer-slot')

// true — слот не держит прокрутку: игра закончена (итог, ошибка), страница доезжает до подвала
export const PLAYER_SCROLL_RELEASE_KEY: InjectionKey<Ref<boolean>> = Symbol('player-scroll-release')
