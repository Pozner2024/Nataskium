import { describe, expect, it } from 'vitest'
import { shuffle } from './shuffle'

describe('shuffle', () => {
  it('random = 0 даёт сдвиг влево, индексы остаются исходными', () => {
    expect(shuffle(['a', 'b', 'c'], () => 0)).toEqual([
      { item: 'b', index: 1 },
      { item: 'c', index: 2 },
      { item: 'a', index: 0 },
    ])
  })

  it('random близкий к 1 оставляет порядок', () => {
    expect(shuffle(['a', 'b', 'c'], () => 0.99).map((entry) => entry.index)).toEqual([0, 1, 2])
  })

  it('исходный массив не меняется, пустой остаётся пустым', () => {
    const source = ['a', 'b']
    shuffle(source, () => 0)
    expect(source).toEqual(['a', 'b'])
    expect(shuffle([])).toEqual([])
  })
})
