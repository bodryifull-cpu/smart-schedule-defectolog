import { describe, expect, it } from 'vitest'
import {
  academicYearEnd,
  academicYearStart,
  addDaysISO,
  buildYearPlan,
  defaultHolidays,
  holidayOn,
  weekMondayOf
} from '@/lib/yearPlan'
import type { CurriculumTopic, Holiday, ScheduleSlot } from '@/types'

const YEAR_START = '2024-09-01' // 2024/25: 01.09.2024 — воскресенье, 31.05.2025 — суббота

function slot(id: number, dayOfWeek: number, lessonNumber = 1, subject = 'Домоводство'): ScheduleSlot {
  return {
    id,
    dayOfWeek: dayOfWeek as ScheduleSlot['dayOfWeek'],
    lessonNumber,
    subjectName: subject,
    topicId: null,
    isLocked: false
  }
}

function topic(id: number, orderIndex: number, subject = 'Домоводство'): CurriculumTopic {
  return { id, subjectName: subject, title: `Тема ${id}`, hours: 1, homework: '', orderIndex }
}

const HOLIDAYS_2024: Holiday[] = defaultHolidays(YEAR_START)

describe('academicYearStart / academicYearEnd', () => {
  it('сентябрь–декабрь → 1 сентября текущего года', () => {
    expect(academicYearStart(new Date(2025, 8, 15))).toBe('2025-09-01')
    expect(academicYearStart(new Date(2025, 11, 31))).toBe('2025-09-01')
  })

  it('январь–август → 1 сентября предыдущего года', () => {
    expect(academicYearStart(new Date(2025, 0, 20))).toBe('2024-09-01')
    expect(academicYearStart(new Date(2025, 7, 10))).toBe('2024-09-01')
  })

  it('учебный год всегда заканчивается 31 мая следующего года', () => {
    expect(academicYearEnd('2024-09-01')).toBe('2025-05-31')
  })
})

describe('defaultHolidays', () => {
  it('типовые каникулы со сдвигом годов', () => {
    expect(HOLIDAYS_2024.filter((h) => h.kind === 'vacation')).toEqual([
      { title: 'Осенние каникулы', startDate: '2024-10-27', endDate: '2024-11-02', kind: 'vacation' },
      { title: 'Зимние каникулы', startDate: '2024-12-29', endDate: '2025-01-11', kind: 'vacation' },
      { title: 'Весенние каникулы', startDate: '2025-03-23', endDate: '2025-03-29', kind: 'vacation' }
    ])
    const h2025 = defaultHolidays('2025-09-01')
    expect(h2025[0].startDate).toBe('2025-10-27')
    expect(h2025[1].endDate).toBe('2026-01-11')
    expect(h2025[2].startDate).toBe('2026-03-23')
  })

  it('праздничные дни РФ внутри учебного года (kind=holiday, startDate=endDate)', () => {
    const singles = HOLIDAYS_2024.filter((h) => h.kind === 'holiday')
    expect(singles.map((h) => [h.title, h.startDate])).toEqual([
      ['День знаний (уроки не проводятся)', '2024-09-01'],
      ['День народного единства', '2024-11-04'],
      ['День защитника Отечества', '2025-02-23'],
      ['Международный женский день', '2025-03-08'],
      ['Праздник Весны и Труда', '2025-05-01'],
      ['День Победы', '2025-05-09']
    ])
    for (const h of singles) {
      expect(h.startDate).toBe(h.endDate)
    }
  })
})

describe('buildYearPlan: границы года', () => {
  it('план не начинается раньше 1 сентября и не заканчивается позже 31 мая', () => {
    const plan = buildYearPlan([slot(1, 7), slot(2, 6)], [], [], YEAR_START)
    expect(plan.occurrences.length).toBeGreaterThan(0)
    const dates = plan.occurrences.map((o) => o.date)
    for (const d of dates) {
      expect(d >= '2024-09-01').toBe(true)
      expect(d <= '2025-05-31').toBe(true)
    }
    // 01.09.2024 — воскресенье: слот Вс попадает на первый день года
    expect(dates).toContain('2024-09-01')
    // 31.05.2025 — суббота: слот Сб попадает на последний день года
    expect(dates).toContain('2025-05-31')
  })
})

describe('buildYearPlan: 7-дневная неделя', () => {
  it('ручные слоты Сб/Вс попадают в план на правильные дни недели', () => {
    const plan = buildYearPlan([slot(1, 6, 1, 'Коррекция'), slot(2, 7, 2, 'ВД')], [], [], YEAR_START)

    const sat = plan.occurrences.filter((o) => o.slotId === 1)
    const sun = plan.occurrences.filter((o) => o.slotId === 2)
    expect(sat.length).toBeGreaterThan(0)
    expect(sun.length).toBeGreaterThan(0)
    // все даты — действительно субботы/воскресенья
    for (const o of sat) {
      expect(new Date(o.date + 'T00:00:00').getDay()).toBe(6)
      expect(o.dayOfWeek).toBe(6)
    }
    for (const o of sun) {
      expect(new Date(o.date + 'T00:00:00').getDay()).toBe(0)
      expect(o.dayOfWeek).toBe(7)
    }
    // первые вхождения: Сб 07.09.2024, Вс 01.09.2024
    expect(sat[0].date).toBe('2024-09-07')
    expect(sun[0].date).toBe('2024-09-01')
  })
})

describe('buildYearPlan: каникулы', () => {
  it('даты каникул (включая границы) исключаются из плана', () => {
    // Вс 27.10.2024 и Сб 02.11.2024 — граничные дни осенних каникул
    const plan = buildYearPlan([slot(1, 7), slot(2, 6)], [], HOLIDAYS_2024, YEAR_START)
    const dates = plan.occurrences.map((o) => o.date)
    expect(dates).not.toContain('2024-10-27')
    expect(dates).not.toContain('2024-11-02')
    expect(dates).not.toContain('2025-01-01')
    // соседние дни вне каникул остаются
    expect(dates).toContain('2024-10-26')
    expect(dates).toContain('2024-11-03')
    expect(dates).toContain('2025-01-12')
  })

  it('holidayOn находит каникулы по границам включительно', () => {
    expect(holidayOn('2024-10-27', HOLIDAYS_2024)?.title).toBe('Осенние каникулы')
    expect(holidayOn('2024-11-02', HOLIDAYS_2024)?.title).toBe('Осенние каникулы')
    expect(holidayOn('2024-10-26', HOLIDAYS_2024)).toBeUndefined()
  })

  it('ни одна тема не назначается на каникулярную дату', () => {
    const topics = [topic(1, 0), topic(2, 1), topic(3, 2)]
    const plan = buildYearPlan([slot(1, 1, 1)], topics, HOLIDAYS_2024, YEAR_START)
    for (const [, date] of plan.topicDates) {
      expect(holidayOn(date, HOLIDAYS_2024)).toBeUndefined()
    }
  })
})

describe('buildYearPlan: распределение тем', () => {
  it('предмет с 1 еженедельным слотом получает ~34–35 занятий за год', () => {
    const plan = buildYearPlan([slot(1, 1, 1)], [], HOLIDAYS_2024, YEAR_START)
    const subjectOccurrences = plan.occurrences.filter((o) => o.subjectName === 'Домоводство')
    expect(subjectOccurrences.length).toBeGreaterThanOrEqual(34)
    expect(subjectOccurrences.length).toBeLessThanOrEqual(35)
  })

  it('темы назначаются строго последовательно по датам', () => {
    const topics = [topic(11, 0), topic(12, 1), topic(13, 2)]
    const plan = buildYearPlan([slot(1, 1, 1)], topics, HOLIDAYS_2024, YEAR_START)
    // Пн в 2024/25: 02.09, 09.09, 16.09 — все вне каникул
    expect(plan.topicDates.get(11)).toBe('2024-09-02')
    expect(plan.topicDates.get(12)).toBe('2024-09-09')
    expect(plan.topicDates.get(13)).toBe('2024-09-16')
    // и в occurrence тоже
    const first = plan.occurrences.filter((o) => o.topicId != null)
    expect(first.map((o) => o.topicId)).toEqual([11, 12, 13])
    expect(plan.unplacedTopics).toHaveLength(0)
  })

  it('несколько уроков предмета в один день идут по номеру урока', () => {
    const topics = [topic(1, 0), topic(2, 1)]
    const plan = buildYearPlan(
      [slot(1, 2, 1), slot(2, 2, 3)], // Вт: уроки 1 и 3
      topics,
      HOLIDAYS_2024,
      YEAR_START
    )
    expect(plan.topicDates.get(1)).toBe('2024-09-03')
    expect(plan.topicDates.get(2)).toBe('2024-09-03')
    const day = plan.occurrences.filter((o) => o.date === '2024-09-03')
    expect(day.map((o) => o.lessonNumber)).toEqual([1, 3])
    expect(day.map((o) => o.topicId)).toEqual([1, 2])
  })

  it('лишние темы попадают в unplacedTopics', () => {
    // предмет есть в темах, но нет в расписании
    const plan = buildYearPlan([], [topic(1, 0), topic(2, 1)], HOLIDAYS_2024, YEAR_START)
    expect(plan.unplacedTopics).toHaveLength(2)
    expect(plan.occurrences).toHaveLength(0)
  })
})

describe('buildYearPlan: праздничные дни', () => {
  it('однодневный праздник исключает ровно одну дату', () => {
    // 04.11.2024 — понедельник, входит в посев по умолчанию
    const holiday = HOLIDAYS_2024.find((h) => h.kind === 'holiday' && h.startDate === '2024-11-04')!
    expect(holiday.endDate).toBe('2024-11-04')
    expect(holidayOn('2024-11-04', HOLIDAYS_2024)).toEqual(holiday)
    expect(holidayOn('2024-11-03', HOLIDAYS_2024)).toBeUndefined()
    expect(holidayOn('2024-11-05', HOLIDAYS_2024)).toBeUndefined()

    // Понедельничный предмет: занятий на одно меньше (04.11), тема на 04.11 не назначается
    const withoutHoliday = buildYearPlan([slot(1, 1, 1)], [], HOLIDAYS_2024.filter((h) => h.kind === 'vacation'), YEAR_START)
    const withHoliday = buildYearPlan([slot(1, 1, 1)], [], HOLIDAYS_2024, YEAR_START)
    expect(withHoliday.occurrences.length).toBe(withoutHoliday.occurrences.length - 1)
    const dates = withHoliday.occurrences.map((o) => o.date)
    expect(dates).not.toContain('2024-11-04')
    expect(dates).toContain('2024-10-21') // пн неделей раньше остаётся
    expect(dates).toContain('2024-11-11') // пн неделей позже остаётся

    const topics = Array.from({ length: 10 }, (_, i) => topic(i + 1, i))
    const plan = buildYearPlan([slot(1, 1, 1)], topics, HOLIDAYS_2024, YEAR_START)
    for (const [, date] of plan.topicDates) {
      expect(date).not.toBe('2024-11-04')
    }
  })
})

describe('buildYearPlan: любой учебный год', () => {
  it('план и посев каникул работают, например, для 2031/32', () => {
    const start = '2031-09-01'
    const holidays = defaultHolidays(start)
    expect(holidays.filter((h) => h.kind === 'vacation').map((h) => h.startDate)).toEqual([
      '2031-10-27',
      '2031-12-29',
      '2032-03-23'
    ])
    expect(holidays.filter((h) => h.kind === 'holiday').map((h) => h.startDate)).toEqual([
      '2031-09-01',
      '2031-11-04',
      '2032-02-23',
      '2032-03-08',
      '2032-05-01',
      '2032-05-09'
    ])

    const plan = buildYearPlan([slot(1, 3, 2)], [topic(1, 0)], holidays, start)
    expect(plan.occurrences.length).toBeGreaterThan(0)
    for (const o of plan.occurrences) {
      expect(o.date >= start).toBe(true)
      expect(o.date <= '2032-05-31').toBe(true)
      expect(new Date(o.date + 'T00:00:00').getDay()).toBe(3) // среда
    }
    expect(plan.topicDates.get(1)).toBe('2031-09-03') // первая среда года
  })
})

describe('buildYearPlan: переносы занятий (moves)', () => {
  it('занятие уезжает с исходной даты на новую, movedFrom/moveId выставляются', () => {
    // Пн-слот: 02.09.2024 — первый понедельник года
    const plan = buildYearPlan([slot(1, 1)], [], HOLIDAYS_2024, YEAR_START, [
      { id: 10, slotId: 1, fromDate: '2024-09-02', toDate: '2024-09-04' }
    ])
    const dates = plan.occurrences.map((o) => o.date)
    expect(dates).not.toContain('2024-09-02')
    expect(dates).toContain('2024-09-04')
    const moved = plan.occurrences.find((o) => o.date === '2024-09-04')!
    expect(moved.movedFrom).toBe('2024-09-02')
    expect(moved.moveId).toBe(10)
    // количество занятий не изменилось — это перенос, а не копия
    const plain = buildYearPlan([slot(1, 1)], [], HOLIDAYS_2024, YEAR_START)
    expect(plan.occurrences).toHaveLength(plain.occurrences.length)
  })

  it('темы назначаются по новым датам (хронология после переноса)', () => {
    const topics = [topic(1, 0), topic(2, 1), topic(3, 2)]
    const plain = buildYearPlan([slot(1, 1)], topics, HOLIDAYS_2024, YEAR_START)
    expect(plain.topicDates.get(1)).toBe('2024-09-02')
    expect(plain.topicDates.get(2)).toBe('2024-09-09')

    const moved = buildYearPlan([slot(1, 1)], topics, HOLIDAYS_2024, YEAR_START, [
      { id: 10, slotId: 1, fromDate: '2024-09-02', toDate: '2024-09-04' }
    ])
    // первая тема уехала вместе с занятием на среду 04.09
    expect(moved.topicDates.get(1)).toBe('2024-09-04')
    expect(moved.topicDates.get(2)).toBe('2024-09-09')
    expect(moved.topicDates.get(3)).toBe('2024-09-16')
  })

  it('устаревший перенос (слота/даты нет в плане) молча игнорируется', () => {
    const plan = buildYearPlan([slot(1, 1)], [], HOLIDAYS_2024, YEAR_START, [
      { id: 11, slotId: 999, fromDate: '2024-09-02', toDate: '2024-09-04' },
      { id: 12, slotId: 1, fromDate: '2024-06-10', toDate: '2024-09-04' } // вне учебного года
    ])
    const plain = buildYearPlan([slot(1, 1)], [], HOLIDAYS_2024, YEAR_START)
    expect(plan.occurrences.map((o) => o.date)).toEqual(plain.occurrences.map((o) => o.date))
  })

  it('без moves план не меняется (обратная совместимость сигнатуры)', () => {
    const a = buildYearPlan([slot(1, 1)], [topic(1, 0)], HOLIDAYS_2024, YEAR_START)
    const b = buildYearPlan([slot(1, 1)], [topic(1, 0)], HOLIDAYS_2024, YEAR_START, [])
    expect(a.occurrences.map((o) => o.date)).toEqual(b.occurrences.map((o) => o.date))
    expect([...a.topicDates.entries()]).toEqual([...b.topicDates.entries()])
  })
})

describe('buildYearPlan: перенос целого дня', () => {
  it('все занятия даты уезжают на новую дату, источник пустеет', () => {
    // Два слота в понедельник: 02.09.2024 — первый понедельник года
    const slots = [slot(1, 1, 1), slot(2, 1, 3)]
    const plain = buildYearPlan(slots, [], HOLIDAYS_2024, YEAR_START)
    expect(plain.occurrences.filter((o) => o.date === '2024-09-02')).toHaveLength(2)

    const moved = buildYearPlan(slots, [], HOLIDAYS_2024, YEAR_START, [
      { id: 1, slotId: 1, fromDate: '2024-09-02', toDate: '2024-09-05' },
      { id: 2, slotId: 2, fromDate: '2024-09-02', toDate: '2024-09-05' }
    ])
    expect(moved.occurrences.filter((o) => o.date === '2024-09-02')).toHaveLength(0)
    const onTarget = moved.occurrences.filter((o) => o.date === '2024-09-05')
    expect(onTarget).toHaveLength(2)
    // номера уроков сохранились, сортировка по lessonNumber
    expect(onTarget.map((o) => o.lessonNumber)).toEqual([1, 3])
    expect(onTarget.every((o) => o.movedFrom === '2024-09-02')).toBe(true)
  })
})

describe('weekMondayOf / addDaysISO (выбор недели)', () => {
  it('понедельник недели для любой даты', () => {
    expect(weekMondayOf('2024-09-02')).toBe('2024-09-02') // пн → сам
    expect(weekMondayOf('2024-09-04')).toBe('2024-09-02') // ср
    expect(weekMondayOf('2024-09-08')).toBe('2024-09-02') // вс → тот же пн
    expect(weekMondayOf('2024-10-01')).toBe('2024-09-30') // переход через месяц
  })

  it('addDaysISO корректно переходит через месяцы и год', () => {
    expect(addDaysISO('2024-09-30', 1)).toBe('2024-10-01')
    expect(addDaysISO('2024-12-30', 7)).toBe('2025-01-06')
    expect(addDaysISO('2024-09-02', -7)).toBe('2024-08-26')
    expect(addDaysISO('2024-09-02', 6)).toBe('2024-09-08') // вс той же недели
  })
})

describe('buildYearPlan: закрепление тем (pins)', () => {
  const threePins = [
    { id: 1, topicId: 1, date: '2024-09-02' },
    { id: 2, topicId: 2, date: '2024-09-09' },
    { id: 3, topicId: 3, date: '2024-09-16' }
  ]
  const threeTopics = [topic(1, 0), topic(2, 1), topic(3, 2)]

  it('закреплённые темы держатся за датами при добавлении нового занятия (ручной слот)', () => {
    // Добавили субботний слот того же предмета — раньше темы сдвигались бы.
    const plan = buildYearPlan(
      [slot(1, 1), slot(2, 6)],
      [...threeTopics, topic(4, 3)],
      HOLIDAYS_2024,
      YEAR_START,
      [],
      threePins
    )
    expect(plan.topicDates.get(1)).toBe('2024-09-02')
    expect(plan.topicDates.get(2)).toBe('2024-09-09')
    expect(plan.topicDates.get(3)).toBe('2024-09-16')
    // незакреплённая тема 4 ушла на первое свободное занятие — субботу 07.09
    expect(plan.topicDates.get(4)).toBe('2024-09-07')
  })

  it('пин переопределяет автоматический порядок', () => {
    const plan = buildYearPlan([slot(1, 1)], threeTopics.slice(0, 2), HOLIDAYS_2024, YEAR_START, [], [
      { id: 1, topicId: 2, date: '2024-09-02' }
    ])
    expect(plan.topicDates.get(2)).toBe('2024-09-02') // тема 2 закреплена за первым занятием
    expect(plan.topicDates.get(1)).toBe('2024-09-09') // тема 1 — на следующее свободное
  })

  it('невалидный пин (в эту дату нет занятия предмета) — тема назначается автоматически', () => {
    const plan = buildYearPlan([slot(1, 1)], [topic(1, 0)], HOLIDAYS_2024, YEAR_START, [], [
      { id: 1, topicId: 1, date: '2024-09-03' } // вторник — занятий предмета нет
    ])
    expect(plan.topicDates.get(1)).toBe('2024-09-02') // автоматически на первое занятие
  })
})

describe('buildYearPlan: пин со slotId (два одинаковых предмета в один день)', () => {
  it('тема привязывается к конкретному уроку, а не ко дню в целом', () => {
    // Два урока «Домоводство» в понедельник: уроки 1 и 2.
    const slots = [slot(1, 1, 1), slot(2, 1, 2)]
    const topics = [topic(1, 0), topic(2, 1)]
    const plan = buildYearPlan(slots, topics, HOLIDAYS_2024, YEAR_START, [], [
      { id: 1, topicId: 2, date: '2024-09-02', slotId: 2 }
    ])
    const first = plan.occurrences.find((o) => o.date === '2024-09-02' && o.slotId === 1)!
    const second = plan.occurrences.find((o) => o.date === '2024-09-02' && o.slotId === 2)!
    expect(second.topicId).toBe(2) // тема 2 — именно на втором уроке
    expect(first.topicId).toBe(1) // тема 1 — автоматически на первый свободный
  })

  it('старый пин без slotId работает как раньше (первое свободное занятие дня)', () => {
    const slots = [slot(1, 1, 1), slot(2, 1, 2)]
    const plan = buildYearPlan(slots, [topic(1, 0)], HOLIDAYS_2024, YEAR_START, [], [
      { id: 1, topicId: 1, date: '2024-09-02' }
    ])
    const first = plan.occurrences.find((o) => o.date === '2024-09-02' && o.slotId === 1)!
    expect(first.topicId).toBe(1)
  })
})

describe('buildYearPlan: День знаний', () => {
  it('1 сентября исключено из плана (уроки не проводятся)', () => {
    // Вс 01.09.2024 и Пн 01.09.2025 — с праздником по умолчанию занятий нет.
    const plan2024 = buildYearPlan([slot(1, 7)], [], HOLIDAYS_2024, '2024-09-01')
    expect(plan2024.occurrences.map((o) => o.date)).not.toContain('2024-09-01')
    expect(plan2024.occurrences[0].date).toBe('2024-09-08') // первое занятие — 8 сентября

    const plan2025 = buildYearPlan([slot(1, 1)], [], defaultHolidays('2025-09-01'), '2025-09-01')
    expect(plan2025.occurrences.map((o) => o.date)).not.toContain('2025-09-01')
    expect(plan2025.occurrences[0].date).toBe('2025-09-08') // первый урок недели — 8 сентября
  })
})

describe('buildYearPlan: переносы учебных дней (overrides)', () => {
  // 22.02.2025 — суббота; делаем её учебной «по расписанию понедельника».
  const OVERRIDE_SAT_AS_MON: import('@/types').DayOverride[] = [
    { id: 1, date: '2025-02-22', asDayOfWeek: 1 }
  ]

  it('в день-перенос действует расписание указанного дня недели', () => {
    const slots = [slot(1, 1, 1, 'Домоводство'), slot(2, 6, 1, 'Коррекция')]
    const plan = buildYearPlan(slots, [], HOLIDAYS_2024, YEAR_START, [], [], OVERRIDE_SAT_AS_MON)
    const onSat = plan.occurrences.filter((o) => o.date === '2025-02-22')
    // идут уроки понедельника…
    expect(onSat.map((o) => o.subjectName)).toEqual(['Домоводство'])
    // …а не субботы (субботний слот в этот день не попадает)
    expect(onSat.every((o) => o.slotId === 1)).toBe(true)
  })

  it('темы назначаются и на перенесённые дни, пины по дате работают', () => {
    const slots = [slot(1, 1, 1)]
    const topics = [topic(1, 0), topic(2, 1)]
    const plan = buildYearPlan(slots, topics, HOLIDAYS_2024, YEAR_START, [], [], OVERRIDE_SAT_AS_MON)
    // в день-перенос появляется занятие по расписанию понедельника
    const satOcc = plan.occurrences.find((o) => o.date === '2025-02-22')
    expect(satOcc?.slotId).toBe(1)
    // при достаточном числе тем тема попадает и на день-перенос
    const manyTopics = Array.from({ length: 30 }, (_, i) => topic(i + 1, i))
    const planMany = buildYearPlan(slots, manyTopics, HOLIDAYS_2024, YEAR_START, [], [], OVERRIDE_SAT_AS_MON)
    expect([...planMany.topicDates.values()]).toContain('2025-02-22')

    // пин на дату-перенос привязывается к уроку по расписанию понедельника
    const pinned = buildYearPlan(slots, topics, HOLIDAYS_2024, YEAR_START, [],
      [{ id: 1, topicId: 2, date: '2025-02-22', slotId: 1 }], OVERRIDE_SAT_AS_MON)
    const occ = pinned.occurrences.find((o) => o.date === '2025-02-22')!
    expect(occ.topicId).toBe(2)
  })

  it('перенос на каникулы не создаёт занятий', () => {
    // 30.12.2024 — зимние каникулы; даже с переносом занятий нет
    const plan = buildYearPlan([slot(1, 1)], [], HOLIDAYS_2024, YEAR_START, [], [], [
      { id: 1, date: '2024-12-30', asDayOfWeek: 1 }
    ])
    expect(plan.occurrences.some((o) => o.date === '2024-12-30')).toBe(false)
  })

  it('без overrides поведение не меняется', () => {
    const a = buildYearPlan([slot(1, 1)], [topic(1, 0)], HOLIDAYS_2024, YEAR_START)
    const b = buildYearPlan([slot(1, 1)], [topic(1, 0)], HOLIDAYS_2024, YEAR_START, [], [], [])
    expect(a.occurrences.map((o) => o.date)).toEqual(b.occurrences.map((o) => o.date))
  })
})
