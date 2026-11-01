import { onMounted, onUnmounted, ref, type Ref } from 'vue'

export function useOffscreenPause(target: Readonly<Ref<HTMLElement | null>>) {
  const isPaused = ref(false)
  let observer: IntersectionObserver | undefined

  onMounted(() => {
    if (!target.value) return
    observer = new IntersectionObserver(([entry]) => {
      if (entry) isPaused.value = !entry.isIntersecting
    })
    observer.observe(target.value)
  })

  onUnmounted(() => observer?.disconnect())

  return { isPaused }
}
