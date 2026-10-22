const MODULUS = 2147483647
const MULTIPLIER = 16807

// Детерминированный генератор: раскладка сцены одинаковая при каждой загрузке и на сервере, и в браузере
export function createSeededRandom(seed: number) {
  let state = seed
  return () => {
    state = (state * MULTIPLIER) % MODULUS
    return state / MODULUS
  }
}
