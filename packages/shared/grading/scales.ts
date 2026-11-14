import type { GradeThreshold } from './grading'

export const GRADING_SCALE_TYPES = ['ten', 'five', 'letter'] as const

export type GradingScaleType = (typeof GRADING_SCALE_TYPES)[number]

// Порог 0 есть у каждой шкалы: оценка ставится при любом проценте
export const GRADING_SCALES: Record<GradingScaleType, readonly GradeThreshold[]> = {
  five: [
    { minPercent: 85, label: '5' },
    { minPercent: 70, label: '4' },
    { minPercent: 50, label: '3' },
    { minPercent: 0, label: '2' },
  ],
  ten: [
    { minPercent: 95, label: '10' },
    { minPercent: 85, label: '9' },
    { minPercent: 75, label: '8' },
    { minPercent: 65, label: '7' },
    { minPercent: 55, label: '6' },
    { minPercent: 45, label: '5' },
    { minPercent: 35, label: '4' },
    { minPercent: 25, label: '3' },
    { minPercent: 15, label: '2' },
    { minPercent: 0, label: '1' },
  ],
  letter: [
    { minPercent: 90, label: 'A' },
    { minPercent: 80, label: 'B' },
    { minPercent: 70, label: 'C' },
    { minPercent: 60, label: 'D' },
    { minPercent: 0, label: 'F' },
  ],
}
