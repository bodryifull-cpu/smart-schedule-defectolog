import Dexie, { type Table } from 'dexie'
import type { CurriculumTopic, DayOverride, Holiday, LessonMove, MetaEntry, ScheduleSlot, TopicPin } from '@/types'

export class AppDatabase extends Dexie {
  slots!: Table<ScheduleSlot, number>
  topics!: Table<CurriculumTopic, number>
  meta!: Table<MetaEntry, string>
  holidays!: Table<Holiday, number>
  moves!: Table<LessonMove, number>
  pins!: Table<TopicPin, number>
  dayOverrides!: Table<DayOverride, number>

  constructor() {
    super('smart-schedule-defectolog')
    this.version(1).stores({
      slots: '++id, dayOfWeek, lessonNumber, subjectName, topicId',
      topics: '++id, subjectName, orderIndex',
      meta: 'key'
    })
    this.version(2).stores({
      holidays: '++id, startDate'
    })
    this.version(3)
      .stores({
        holidays: '++id, startDate'
      })
      .upgrade((tx) =>
        // Существующие записи каникул получают kind='vacation'.
        tx
          .table('holidays')
          .toCollection()
          .modify((h: Holiday) => {
            if (!h.kind) h.kind = h.startDate === h.endDate ? 'holiday' : 'vacation'
          })
      )
    this.version(4).stores({
      moves: '++id, slotId, fromDate'
    })
    this.version(5).stores({
      pins: '++id, topicId, date'
    })
    this.version(6).stores({
      pins: '++id, topicId, date, slotId'
    })
    this.version(7).stores({
      dayOverrides: '++id, date'
    })
  }
}

export const db = new AppDatabase()

export async function getMeta<T>(key: string): Promise<T | undefined> {
  const entry = await db.meta.get(key)
  return entry?.value as T | undefined
}

export async function setMeta(key: string, value: unknown): Promise<void> {
  await db.meta.put({ key, value })
}

export async function resetAll(): Promise<void> {
  await db.transaction(
    'rw',
    [db.slots, db.topics, db.meta, db.holidays, db.moves, db.pins, db.dayOverrides],
    async () => {
      await db.slots.clear()
      await db.topics.clear()
      await db.meta.clear()
      await db.holidays.clear()
      await db.moves.clear()
      await db.pins.clear()
      await db.dayOverrides.clear()
    }
  )
}
