// Фишер–Йетс; index — исходное место элемента (именно оно уходит на сервер)
export function shuffle<T>(items: readonly T[], random: () => number = Math.random): { item: T; index: number }[] {
  const result = items.map((item, index) => ({ item, index }))
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1))
    const swap = result[i]!
    result[i] = result[j]!
    result[j] = swap
  }
  return result
}
