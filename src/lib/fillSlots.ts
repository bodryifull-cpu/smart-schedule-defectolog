import type { ParsedTopic } from '@/lib/parseKtp'
import type { ScheduleSlot } from '@/types'

/** Тема, сохранённая в БД (id известен) или ещё нет. */
export type FillTopic = ParsedTopic & { id?: number }

export interface FillResult {
  /** Изменённые слоты (только слоты выбранного предмета). */
  updatedSlots: ScheduleSlot[]
  /** Сколько тем удалось разместить. */
  placedCount: number
  /** Сколько тем не поместилось (не хватило слотов предмета). */
  unplacedCount: number
}

/**
 * Привязка тем КТП к слотам расписания.
 * Берём ТОЛЬКО слоты выбранного предмета, сортируем по (dayOfWeek, lessonNumber),
 * темы — по orderIndex, назначаем по порядку. Заполненные слоты блокируем.
 * Остальные слоты не трогаем.
 */
export function fillSlots(
  slots: ScheduleSlot[],
  topics: FillTopic[],
  selectedSubject: string
): FillResult {
  const subjectSlots = slots
    .filter((s) => s.subjectName === selectedSubject)
    .sort((a, b) => a.dayOfWeek - b.dayOfWeek || a.lessonNumber - b.lessonNumber)

  const orderedTopics = [...topics].sort((a, b) => a.orderIndex - b.orderIndex)
  const placedCount = Math.min(subjectSlots.length, orderedTopics.length)

  const updatedSlots: ScheduleSlot[] = []
  for (let i = 0; i < placedCount; i++) {
    const slot = subjectSlots[i]
    const topic = orderedTopics[i]
    updatedSlots.push({
      ...slot,
      topicId: topic.id ?? null,
      isLocked: true
    })
  }

  return {
    updatedSlots,
    placedCount,
    unplacedCount: orderedTopics.length - placedCount
  }
}
