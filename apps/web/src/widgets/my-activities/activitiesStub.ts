import type { Activity } from '@/entities/activity'

// Заглушка до API заданий: страница «Мои задания» берёт список отсюда. Названия — пользовательский текст, не переводятся
export const ACTIVITIES_STUB: Activity[] = [
  { id: 'stub-1', title: 'Дроби: сложение и вычитание', type: 'quiz', questionCount: 12, scaleName: '5-балльная', shareToken: 'stub-token-1' },
  { id: 'stub-2', title: 'Present Simple — вставь глагол в правильной форме', type: 'gaps', questionCount: 8, scaleName: null, shareToken: 'stub-token-2' },
  { id: 'stub-3', title: 'Животные Африки', type: 'pictures', questionCount: 10, scaleName: 'A–F', shareToken: 'stub-token-3' },
]
