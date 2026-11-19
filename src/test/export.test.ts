import { describe, expect, it } from 'vitest'
import { buildWeekExport } from '@/lib/exportSchedule'
import type { YearOccurrence } from '@/lib/yearPlan'
import type { CurriculumTopic } from '@/types'

function occ(date: string, slotId: number, lessonNumber: number, topicId: number | null): YearOccurrence {
  return {
    date,
    slotId,
    dayOfWeek: 1,
    lessonNumber,
    subjectName: 'Домоводство',
    topicId
  }
}

const topics: CurriculumTopic[] = [
  { id: 1, subjectName: 'Домоводство', title: 'Тема А', hours: 1, homework: 'Д/з А', orderIndex: 0 },
  { id: 2, subjectName: 'Домоводство', title: 'Тема Б', hours: 1, homework: '', orderIndex: 1 }
]

describe('buildWeekExport', () => {
  it('возвращает 7 дней с датами выбранной недели, пустые дни — без занятий', () => {
    const days = buildWeekExport([], [], '2024-09-02') // неделя 02.09–08.09
    expect(days).toHaveLength(7)
    expect(days[0].date).toBe('2024-09-02')
    expect(days[6].date).toBe('2024-09-08')
    expect(days.every((d) => d.lessons.length === 0)).toBe(true)
  })

  it('занятия попадают в свой день, сортируются по номеру урока, с темой и Д/з', () => {
    const days = buildWeekExport(
      [occ('2024-09-03', 1, 3, 2), occ('2024-09-03', 2, 1, 1), occ('2024-09-06', 3, 2, null)],
      topics,
      '2024-09-02'
    )
    const tue = days[1]
    expect(tue.lessons.map((l) => l.lessonNumber)).toEqual([1, 3])
    expect(tue.lessons[0]).toMatchObject({
      subjectName: 'Домоводство',
      topicNumber: 1,
      topicTitle: 'Тема А',
      homework: 'Д/з А'
    })
    // тема без Д/з → homework undefined
    expect(tue.lessons[1].homework).toBeUndefined()
    // занятие без темы
    const fri = days[4]
    expect(fri.lessons[0].topicTitle).toBeUndefined()
  })

  it('перенесённое занятие попадает в день фактической даты', () => {
    // занятие понедельника перенесено на среду
    const moved = { ...occ('2024-09-04', 1, 1, 1), movedFrom: '2024-09-02', moveId: 5 }
    const days = buildWeekExport([moved], topics, '2024-09-02')
    expect(days[0].lessons).toHaveLength(0) // в понедельник пусто
    expect(days[2].lessons).toHaveLength(1) // в среду — занятие с темой
    expect(days[2].lessons[0].topicTitle).toBe('Тема А')
  })
})
