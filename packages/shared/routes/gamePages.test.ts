import { describe, expect, it } from 'vitest'
import { ACTIVITY_KINDS } from '../schemas'
import { GAME_TYPE_SLUGS, gameTypePath, parseGameTypeSlug } from './gamePages'
import { newActivityPath } from './teacherPages'

describe('gameTypePath', () => {
  it('ведёт на slug типа', () => {
    expect(gameTypePath('truefalse')).toBe('/games/true-false')
  })
})

describe('parseGameTypeSlug', () => {
  it('распознаёт slug каждого типа', () => {
    expect(ACTIVITY_KINDS.map((kind) => parseGameTypeSlug(GAME_TYPE_SLUGS[kind]))).toEqual([...ACTIVITY_KINDS])
  })

  it('отклоняет чужие и служебные значения', () => {
    for (const slug of ['truefalse', 'gaps', '', 'Quiz', '__proto__', 'toString']) {
      expect(parseGameTypeSlug(slug)).toBeNull()
    }
  })
})

describe('newActivityPath', () => {
  it('ведёт в редактор нового задания каждого типа', () => {
    expect(ACTIVITY_KINDS.map(newActivityPath)).toEqual(['/teacher/quiz/new', '/teacher/matching/new', '/teacher/true-false/new'])
  })
})
