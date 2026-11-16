const SECONDS_PER_MINUTE = 60
const SECONDS_PAD = 2

export function formatClock(totalSeconds: number): string {
  const safe = Math.max(0, Math.floor(totalSeconds))
  const minutes = Math.floor(safe / SECONDS_PER_MINUTE)
  const seconds = String(safe % SECONDS_PER_MINUTE).padStart(SECONDS_PAD, '0')
  return `${minutes}:${seconds}`
}
