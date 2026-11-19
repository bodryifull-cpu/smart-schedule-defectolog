import type { CurriculumTopic, DayOverride, Holiday, LessonMove, ScheduleSlot, TopicPin } from '@/types'

/** Одно занятие в учебном году: слот недельного расписания, привязанный к конкретной дате. */
export interface YearOccurrence {
  date: string // ISO yyyy-mm-dd
  slotId: number
  dayOfWeek: number
  lessonNumber: number
  subjectName: string
  /** Тема, назначенная на это занятие (null, если тем не хватило). */
  topicId: number | null
  /** Если занятие перенесено — его исходная дата по недельному шаблону. */
  movedFrom?: string
  /** Id записи переноса (для отмены/повторного переноса). */
  moveId?: number
}

export interface YearPlan {
  /** Все занятия года, отсортированные по (date, lessonNumber). */
  occurrences: YearOccurrence[]
  /** topicId → дата проведения (ISO). */
  topicDates: Map<number, string>
  /** Темы, не поместившиеся в доступные занятия предмета. */
  unplacedTopics: CurriculumTopic[]
}

export function toISODate(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/** ISO-день недели: Пн=1 … Вс=7. */
export function isoDayOfWeek(d: Date): number {
  return ((d.getDay() + 6) % 7) + 1
}

/**
 * Начало учебного года для даты: 1 сентября текущего календарного года,
 * если месяц >= сентября, иначе 1 сентября предыдущего года.
 */
export function academicYearStart(today: Date = new Date()): string {
  const year = today.getMonth() >= 8 ? today.getFullYear() : today.getFullYear() - 1
  return `${year}-09-01`
}

/** Конец учебного года: 31 мая года, следующего за годом начала. */
export function academicYearEnd(schoolYearStart: string): string {
  const year = Number(schoolYearStart.slice(0, 4)) + 1
  return `${year}-05-31`
}

/** Каникулы и праздничные дни по умолчанию для учебного года, начинающегося в schoolYearStart. */
export function defaultHolidays(schoolYearStart: string): Holiday[] {
  const y = Number(schoolYearStart.slice(0, 4))
  const vacations: Holiday[] = [
    { title: 'Осенние каникулы', startDate: `${y}-10-27`, endDate: `${y}-11-02`, kind: 'vacation' },
    { title: 'Зимние каникулы', startDate: `${y}-12-29`, endDate: `${y + 1}-01-11`, kind: 'vacation' },
    {
      title: 'Весенние каникулы',
      startDate: `${y + 1}-03-23`,
      endDate: `${y + 1}-03-29`,
      kind: 'vacation'
    }
  ]
  // Праздничные дни РФ внутри окна 1 сен – 31 мая (1–8 января покрыты зимними каникулами,
  // 12 июня — вне учебного года).
  const singleDay = (title: string, date: string): Holiday => ({
    title,
    startDate: date,
    endDate: date,
    kind: 'holiday'
  })
  const holidays: Holiday[] = [
    // 1 сентября — День знаний: дети в школе, но уроки не ведутся.
    singleDay('День знаний (уроки не проводятся)', `${y}-09-01`),
    singleDay('День народного единства', `${y}-11-04`),
    singleDay('День защитника Отечества', `${y + 1}-02-23`),
    singleDay('Международный женский день', `${y + 1}-03-08`),
    singleDay('Праздник Весны и Труда', `${y + 1}-05-01`),
    singleDay('День Победы', `${y + 1}-05-09`)
  ]
  return [...vacations, ...holidays]
}

/** Каникулы, действующие на дату (ISO-строки сравниваются лексикографически). */
export function holidayOn(date: string, holidays: Holiday[]): Holiday | undefined {
  return holidays.find((h) => h.startDate <= date && date <= h.endDate)
}

/** ISO-дата + N дней (переходы через месяцы/годы корректны). */
export function addDaysISO(iso: string, days: number): string {
  const d = new Date(iso + 'T00:00:00')
  d.setDate(d.getDate() + days)
  return toISODate(d)
}

/** Понедельник недели, содержащей дату (ISO). */
export function weekMondayOf(iso: string): string {
  const d = new Date(iso + 'T00:00:00')
  return addDaysISO(iso, 1 - isoDayOfWeek(d))
}

/**
 * Распределение занятий и тем на учебный год (1 сентября – 31 мая).
 * Чистая функция: ничего не сохраняет, результат вычисляется в памяти.
 * Переносы (moves) применяются ДО назначения тем: темы идут по новым датам.
 */
export function buildYearPlan(
  slots: ScheduleSlot[],
  topics: CurriculumTopic[],
  holidays: Holiday[],
  schoolYearStart: string,
  moves: LessonMove[] = [],
  pins: TopicPin[] = [],
  overrides: DayOverride[] = []
): YearPlan {
  const start = new Date(schoolYearStart + 'T00:00:00')
  const end = new Date(academicYearEnd(schoolYearStart) + 'T00:00:00')

  // Переносы учебных дней: дата → чьё расписание действует (1=Пн … 7=Вс).
  const overrideByDate = new Map(overrides.map((o) => [o.date, o.asDayOfWeek]))

  // 1. Все даты учебного года, пропуская каникулы.
  const occurrences: YearOccurrence[] = []
  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    const date = toISODate(d)
    if (holidayOn(date, holidays)) continue
    // Если для даты задан перенос — действует расписание другого дня недели.
    const dow = overrideByDate.get(date) ?? isoDayOfWeek(d)
    for (const slot of slots) {
      if (slot.dayOfWeek !== dow || slot.id == null) continue
      occurrences.push({
        date,
        slotId: slot.id,
        dayOfWeek: slot.dayOfWeek,
        lessonNumber: slot.lessonNumber,
        subjectName: slot.subjectName,
        topicId: null
      })
    }
  }
  occurrences.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.lessonNumber - b.lessonNumber))

  // 1.5. Применяем переносы: занятие уезжает с исходной даты на новую.
  if (moves.length > 0) {
    const bySlotAndDate = new Map(occurrences.map((o) => [`${o.slotId}|${o.date}`, o]))
    for (const move of moves) {
      const occ = bySlotAndDate.get(`${move.slotId}|${move.fromDate}`)
      if (!occ) continue // слот удалён или даты нет в году — перенос устарел
      bySlotAndDate.delete(`${move.slotId}|${move.fromDate}`)
      occ.date = move.toDate
      occ.movedFrom = move.fromDate
      occ.moveId = move.id
      bySlotAndDate.set(`${move.slotId}|${move.toDate}`, occ)
    }
    occurrences.sort((a, b) =>
      a.date < b.date ? -1 : a.date > b.date ? 1 : a.lessonNumber - b.lessonNumber
    )
  }

  // 2. Темы по предметам → занятия. Сначала закреплённые (pins) — они не сдвигаются
  //    при изменении расписания; затем остальные — автоматически по порядку на свободные занятия.
  const topicsBySubject = new Map<string, CurriculumTopic[]>()
  const topicById = new Map<number, CurriculumTopic>()
  for (const topic of topics) {
    const list = topicsBySubject.get(topic.subjectName) ?? []
    list.push(topic)
    topicsBySubject.set(topic.subjectName, list)
    if (topic.id != null) topicById.set(topic.id, topic)
  }
  for (const list of topicsBySubject.values()) {
    list.sort((a, b) => a.orderIndex - b.orderIndex)
  }

  const topicDates = new Map<number, string>()
  const unplacedTopics: CurriculumTopic[] = []
  const occurrencesBySubject = new Map<string, YearOccurrence[]>()
  for (const occ of occurrences) {
    const list = occurrencesBySubject.get(occ.subjectName) ?? []
    list.push(occ)
    occurrencesBySubject.set(occ.subjectName, list)
  }

  // 2a. Закрепления: тема ставится на своё занятие конкретной даты.
  //     Пин недействителен, если в эту дату нет занятия предмета (тема останется незакреплённой).
  const pinnedTopicIds = new Set<number>()
  const sortedPins = [...pins].sort((a, b) => (a.date < b.date ? -1 : 1))
  for (const pin of sortedPins) {
    const topic = topicById.get(pin.topicId)
    if (!topic || topic.id == null) continue
    // Пин со slotId целится в конкретный урок дня; без slotId (старые записи) —
    // в первое свободное занятие предмета в этот день.
    const occ = (occurrencesBySubject.get(topic.subjectName) ?? []).find(
      (o) =>
        o.date === pin.date &&
        o.topicId == null &&
        (pin.slotId == null || o.slotId === pin.slotId)
    )
    if (!occ) continue
    occ.topicId = topic.id
    topicDates.set(topic.id, pin.date)
    pinnedTopicIds.add(topic.id)
  }

  // 2b. Остальные темы — последовательно на свободные занятия своего предмета.
  for (const [subject, subjectTopics] of topicsBySubject) {
    const freeOccurrences = (occurrencesBySubject.get(subject) ?? []).filter(
      (o) => o.topicId == null
    )
    let freeIndex = 0
    for (const topic of subjectTopics) {
      if (topic.id == null || pinnedTopicIds.has(topic.id)) continue
      const occ = freeOccurrences[freeIndex++]
      if (occ) {
        occ.topicId = topic.id
        topicDates.set(topic.id, occ.date)
      } else {
        unplacedTopics.push(topic)
      }
    }
  }

  return { occurrences, topicDates, unplacedTopics }
}
