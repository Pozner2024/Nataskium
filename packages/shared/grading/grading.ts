export type GradeThreshold = { minPercent: number; label: string }

export function calculatePercent(correctCount: number, totalCount: number): number {
  if (!Number.isInteger(totalCount) || totalCount <= 0) {
    throw new RangeError('totalCount must be a positive integer')
  }
  if (!Number.isInteger(correctCount) || correctCount < 0 || correctCount > totalCount) {
    throw new RangeError('correctCount must be an integer from 0 to totalCount')
  }

  // Умножение до деления: (57 / 100) * 100 даёт 56.99999999999999 и занизило бы оценку на границе порога
  return (correctCount * 100) / totalCount
}

export function gradeByScale(percent: number, thresholds: readonly GradeThreshold[]): string | null {
  const reached = thresholds.filter(({ minPercent }) => minPercent <= percent)
  if (reached.length === 0) return null

  return reached.reduce((best, threshold) =>
    threshold.minPercent > best.minPercent ? threshold : best,
  ).label
}
