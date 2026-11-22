import type { gsap as Gsap } from 'gsap'

// На плохой сети чанк может грузиться бесконечно: дольше не ждём, игра идёт без анимации
export const GSAP_LOAD_TIMEOUT_MS = 4000

let pending: Promise<typeof Gsap> | null = null

async function importGsap(): Promise<typeof Gsap> {
  const module = await import('gsap')
  return module.gsap
}

async function importWithTimeout(): Promise<typeof Gsap> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error('GSAP load timed out')), GSAP_LOAD_TIMEOUT_MS)
  })
  try {
    return await Promise.race([importGsap(), timeout])
  } finally {
    clearTimeout(timer)
  }
}

// Единственное место импорта GSAP: отдельный чанк, грузится только в браузере и только для темы кодом.
// Сервер интро не рисует, темам-роликам библиотека не нужна (ADR 0015).
// Неудачная загрузка не запоминается: следующий вызов пробует снова
export function loadGsap(): Promise<typeof Gsap> {
  if (import.meta.server) throw new Error('GSAP loads only in the browser')
  pending ??= importWithTimeout().catch((error: unknown) => {
    pending = null
    throw error
  })
  return pending
}
