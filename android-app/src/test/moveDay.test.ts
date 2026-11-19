import { describe, expect, it } from 'vitest'
import { moveDay } from '@/lib/moveDay'
import type { ScheduleSlot } from '@/types'

function slot(
  id: number,
  dayOfWeek: number,
  lessonNumber: number,
  subject = 'Домоводство',
  isLocked = false
): ScheduleSlot {
  return {
    id,
    dayOfWeek: dayOfWeek as ScheduleSlot['dayOfWeek'],
    lessonNumber,
    subjectName: subject,
    topicId: null,
    isLocked
  }
}

describe('moveDay', () => {
  it('перенос в пустую колонку: все слоты меняют dayOfWeek, источник пустеет', () => {
    const slots = [
      slot(1, 5, 1, 'ИЗО'),
      slot(2, 5, 3, 'ВД', true), // заблокированный тоже переносится
      slot(3, 1, 1, 'Музыка и движение') // другой день — не участвует
    ]
    const updated = moveDay(slots, 5, 6)

    expect(updated).toHaveLength(2)
    expect(updated.every((s) => s.dayOfWeek === 6)).toBe(true)
    expect(updated.map((s) => s.lessonNumber).sort()).toEqual([1, 3])
    // идентичность и прочие поля сохранены
    expect(updated.find((s) => s.id === 2)).toMatchObject({
      subjectName: 'ВД',
      isLocked: true,
      lessonNumber: 3
    })

    // Применяем результат к исходному массиву: пятница пуста, суббота заполнена
    const after = slots.map((s) => updated.find((u) => u.id === s.id) ?? s)
    expect(after.filter((s) => s.dayOfWeek === 5)).toHaveLength(0)
    expect(after.filter((s) => s.dayOfWeek === 6)).toHaveLength(2)
    expect(after.find((s) => s.id === 3)?.dayOfWeek).toBe(1)
  })

  it('обмен с непустой колонкой: дни меняются местами, номера уроков сохраняются', () => {
    const slots = [
      slot(1, 5, 1, 'ИЗО'),
      slot(2, 5, 2, 'ВД'),
      slot(3, 6, 2, 'Коррекция'),
      slot(4, 6, 4, 'ППД', true)
    ]
    const updated = moveDay(slots, 5, 6)
    expect(updated).toHaveLength(4)

    const after = slots.map((s) => updated.find((u) => u.id === s.id) ?? s)
    // Пятница получила уроки субботы
    expect(
      after
        .filter((s) => s.dayOfWeek === 5)
        .map((s) => [s.lessonNumber, s.subjectName])
        .sort()
    ).toEqual([
      [2, 'Коррекция'],
      [4, 'ППД']
    ])
    // Суббота получила уроки пятницы
    expect(
      after
        .filter((s) => s.dayOfWeek === 6)
        .map((s) => [s.lessonNumber, s.subjectName])
        .sort()
    ).toEqual([
      [1, 'ИЗО'],
      [2, 'ВД']
    ])
    // lessonNumber у каждого слота не изменился
    for (const s of after) {
      const orig = slots.find((o) => o.id === s.id)!
      expect(s.lessonNumber).toBe(orig.lessonNumber)
      expect(s.isLocked).toBe(orig.isLocked)
    }
  })

  it('перенос на тот же день — пустой результат', () => {
    expect(moveDay([slot(1, 3, 1)], 3, 3)).toEqual([])
  })

  it('перенос пустого дня — пустой результат', () => {
    expect(moveDay([slot(1, 3, 1)], 5, 3)).toEqual([])
  })

  it('исходный массив не мутируется', () => {
    const slots = [slot(1, 5, 1)]
    moveDay(slots, 5, 7)
    expect(slots[0].dayOfWeek).toBe(5)
  })
})
