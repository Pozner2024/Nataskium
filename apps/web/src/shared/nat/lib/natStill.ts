import { type InjectionKey, type Ref, onUnmounted, provide, ref } from 'vue'

// Режим «Нат стоит, пока его не трогают»: для страниц, где на экране сразу несколько сцен (библиотека).
// Без провайдера сцены работают как раньше — постоянно
export type NatStill = { isAwake: Ref<boolean> }

export const NAT_STILL: InjectionKey<NatStill> = Symbol('nat-still')

// Включает режим для всех Натов внутри компонента; wake() оживляет их на awakeMs, повторный вызов продлевает
export function provideNatStill(awakeMs: number): { wake: () => void } {
  const isAwake = ref(false)
  let timer: ReturnType<typeof setTimeout> | undefined

  function wake() {
    isAwake.value = true
    clearTimeout(timer)
    timer = setTimeout(() => {
      isAwake.value = false
    }, awakeMs)
  }

  provide(NAT_STILL, { isAwake })
  onUnmounted(() => clearTimeout(timer))

  return { wake }
}
