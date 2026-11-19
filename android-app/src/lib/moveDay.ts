import type { ScheduleSlot } from '@/types'

/**
 * Перенос/обмен всех уроков одного дня недели с другим днём.
 * - Если в целевом дне нет уроков — все слоты исходного дня переезжают (меняется dayOfWeek).
 * - Если в целевом дне есть уроки — колонки меняются местами (обмен dayOfWeek),
 *   выравнивание по lessonNumber сохраняется автоматически; у слотов без пары просто
 *   меняется день. Заблокированные слоты участвуют наравне с остальными.
 * - Если исходный день пуст — переносить нечего, возвращается пустой массив.
 * Возвращает ТОЛЬКО изменённые слоты (для bulkPut).
 */
export function moveDay(
  slots: ScheduleSlot[],
  fromDay: number,
  toDay: number
): ScheduleSlot[] {
  if (fromDay === toDay) return []
  const source = slots.filter((s) => s.dayOfWeek === fromDay)
  if (source.length === 0) return []
  const target = slots.filter((s) => s.dayOfWeek === toDay)

  const updated: ScheduleSlot[] = source.map((s) => ({ ...s, dayOfWeek: toDay as ScheduleSlot['dayOfWeek'] }))
  if (target.length > 0) {
    updated.push(
      ...target.map((s) => ({ ...s, dayOfWeek: fromDay as ScheduleSlot['dayOfWeek'] }))
    )
  }
  return updated
}
