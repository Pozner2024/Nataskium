import { DEFAULT_INTRO_THEME_KEY } from '@nataskium/shared/schemas'
import type { Activity } from '@/entities/activity'

// Заглушка до API заданий: страница «Мои задания» берёт список отсюда. Названия — пользовательский текст, не переводятся
export const ACTIVITIES_STUB: Activity[] = [
  {
    id: 'stub-1',
    title: 'Дроби: сложение и вычитание',
    type: 'quiz',
    questionCount: 12,
    gradingScale: 'five',
    shareToken: 'stub-token-1',
    introTheme: DEFAULT_INTRO_THEME_KEY,
    thumbnail: { type: 'quiz', text: 'Сколько будет 1/2 + 1/4?', imageUrl: null, options: [{ text: '3/4' }, { text: '2/6' }, { text: '1/8' }, { text: '1' }] },
  },
  {
    id: 'stub-2',
    title: 'Столицы Европы',
    type: 'matching',
    questionCount: 8,
    gradingScale: null,
    shareToken: 'stub-token-2',
    introTheme: DEFAULT_INTRO_THEME_KEY,
    thumbnail: { type: 'matching', definitions: ['Столица Франции', 'Столица Италии', 'Столица Испании'] },
  },
  {
    id: 'stub-3',
    title: 'Животные Африки',
    type: 'truefalse',
    questionCount: 10,
    gradingScale: 'letter',
    shareToken: 'stub-token-3',
    introTheme: DEFAULT_INTRO_THEME_KEY,
    thumbnail: { type: 'truefalse', statement: 'Жираф — самое высокое животное на Земле' },
  },
]
