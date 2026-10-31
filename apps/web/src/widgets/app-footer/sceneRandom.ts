import { createSeededRandom } from '@/shared'

// Задержки и длительности анимаций должны совпасть на сервере и в браузере, иначе гидрация SSR не сойдётся
export function createRandomBetween(seed: number) {
  const random = createSeededRandom(seed)
  return (min: number, max: number) => min + random() * (max - min)
}
