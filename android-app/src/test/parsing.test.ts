import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { normalizeSubject } from '@/lib/normalize'
import { parseScheduleDocx, rowsToSlots } from '@/lib/parseSchedule'
import { parseKtpXls, rowsToTopics } from '@/lib/parseKtp'
import { fillSlots } from '@/lib/fillSlots'
import type { ScheduleSlot } from '@/types'

const fixturesDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'fixtures')

const EXPECTED_SUBJECTS = [
  'Музыка и движение',
  'Домоводство',
  'Окр. соц. мир',
  'Речь и альт. К.',
  'Человек',
  'Матем. Пред-я',
  'Окр. пр. мир',
  'ИЗО',
  'Коррекция',
  'Адаптив. физ-ра',
  'Разговоры о важном',
  'ППД',
  'ВД',
  'Двиг. развитие',
  'Классный час'
]

function readFixture(name: string): ArrayBuffer {
  const buf = fs.readFileSync(path.join(fixturesDir, name))
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer
}

describe('normalizeSubject', () => {
  it('убирает пробел перед точкой и ставит ровно один после', () => {
    expect(normalizeSubject('Адаптив . физ-ра')).toBe('Адаптив. физ-ра')
    expect(normalizeSubject('Окр . соц . мир')).toBe('Окр. соц. мир')
    expect(normalizeSubject('Матем . Пред-я')).toBe('Матем. Пред-я')
  })

  it('исправляет опечатку «важн ом»', () => {
    expect(normalizeSubject('Разговоры о важн ом')).toBe('Разговоры о важном')
  })

  it('схлопывает пробелы и делает trim', () => {
    expect(normalizeSubject('  Музыка   и   движение  ')).toBe('Музыка и движение')
  })

  it('не портит уже нормальные названия', () => {
    expect(normalizeSubject('Речь и альт. К.')).toBe('Речь и альт. К.')
    expect(normalizeSubject('Домоводство')).toBe('Домоводство')
  })
})

describe('parseScheduleDocx', () => {
  it('парсит таблицу: 8 уроков, нет слотов для пустых ячеек, нормализация предметов', async () => {
    const slots = await parseScheduleDocx(readFixture('расписание.docx'))

    // 40 ячеек минус 2 пустые (Пт, уроки 7 и 8)
    expect(slots).toHaveLength(38)

    // нет слотов на пустых ячейках Пт-7 и Пт-8
    expect(slots.find((s) => s.dayOfWeek === 5 && s.lessonNumber === 7)).toBeUndefined()
    expect(slots.find((s) => s.dayOfWeek === 5 && s.lessonNumber === 8)).toBeUndefined()

    // уроки только 1..8, дни только 1..5
    for (const s of slots) {
      expect(s.lessonNumber).toBeGreaterThanOrEqual(1)
      expect(s.lessonNumber).toBeLessThanOrEqual(8)
      expect(s.dayOfWeek).toBeGreaterThanOrEqual(1)
      expect(s.dayOfWeek).toBeLessThanOrEqual(5)
      expect(s.topicId).toBeNull()
      expect(s.isLocked).toBe(false)
    }

    // уникальные предметы после нормализации — ровно ожидаемые 15
    const subjects = [...new Set(slots.map((s) => s.subjectName))].sort((a, b) =>
      a.localeCompare(b, 'ru')
    )
    expect(subjects).toEqual([...EXPECTED_SUBJECTS].sort((a, b) => a.localeCompare(b, 'ru')))
  })
})

describe('rowsToSlots: реальные файлы с заголовками и номерами', () => {
  it('игнорирует строку с днями недели и колонку с номерами уроков', () => {
    const rows = [
      ['5и класс'],
      ['№', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт'],
      ['1', 'Домоводство', 'Музыка и движение', '', 'ИЗО', 'ВД'],
      ['2', 'Домоводство', 'Человек', '', 'ППД', '']
    ]
    const slots = rowsToSlots(rows)
    // строка дней недели не стала уроками
    expect(slots.every((s) => !['Пн', 'Вт', 'Ср', 'Чт', 'Пт'].includes(s.subjectName))).toBe(true)
    // номера уроков не стали предметами
    expect(slots.every((s) => !/^\d+$/.test(s.subjectName))).toBe(true)
    // 7 предметных ячеек; Пт взят из 6-й колонки (после колонки номеров)
    expect(slots).toHaveLength(7)
    expect(slots.find((s) => s.dayOfWeek === 5 && s.lessonNumber === 1)?.subjectName).toBe('ВД')
    expect(slots.find((s) => s.dayOfWeek === 1 && s.lessonNumber === 2)?.subjectName).toBe('Домоводство')
  })

  it('срезает префиксы-номера из названий: «1. Домоводство» и «2. Домоводство» — один предмет', () => {
    const rows = [
      ['5и класс'],
      ['1. Домоводство', '', '', '', ''],
      ['2. Домоводство', '', '', '', '']
    ]
    const slots = rowsToSlots(rows)
    expect(slots).toHaveLength(2)
    // оба слота — один и тот же нормализованный предмет
    expect(new Set(slots.map((s) => s.subjectName))).toEqual(new Set(['Домоводство']))
    expect(slots.map((s) => s.lessonNumber)).toEqual([1, 2])
  })

  it('полные названия дней недели тоже распознаются как заголовок', () => {
    const rows = [
      ['Понедельник', 'Вторник', 'Среда', 'Четверг', 'Пятница'],
      ['ИЗО', 'ВД', '', '', '']
    ]
    const slots = rowsToSlots(rows)
    expect(slots).toHaveLength(2)
    expect(slots.map((s) => s.dayOfWeek)).toEqual([1, 2])
  })

  it('строка с предметом «Классный час» не считается заголовком', () => {
    const rows = [
      ['5и класс', '', '', '', ''],
      ['Классный час', 'ИЗО', 'ВД', 'ППД', 'Человек']
    ]
    const slots = rowsToSlots(rows)
    expect(slots).toHaveLength(5)
    expect(slots[0].subjectName).toBe('Классный час')
  })
})

describe('parseKtpXls', () => {
  it('парсит лист Planirovanie: 59 тем, разделы исключены, часы = 1', () => {
    const topics = parseKtpXls(readFixture('5и домоводство.xls'))

    expect(topics).toHaveLength(59)
    expect(topics.every((t) => !/^раздел/i.test(t.title))).toBe(true)
    expect(topics.every((t) => t.hours === 1)).toBe(true)
    // orderIndex по порядку
    topics.forEach((t, i) => expect(t.orderIndex).toBe(i))
    expect(topics[0].title).toContain('Тема 1')
  })
})

describe('rowsToTopics: разделы не попадают в темы', () => {
  it('пропускает разделы в разных форматах, но оставляет похожие темы', () => {
    const rows = [
      ['№ п/п', 'Тема', 'Кол-во часов', 'Домашнее задание'],
      ['', 'Раздел 1', '', ''],
      ['', 'Раздел 2. Кулинария', '', ''],
      ['', '1. Раздел 3. Сервировка', '', ''],
      ['Раздел 4', 'Тема из колонки №', '', ''],
      ['1', 'Тема 1. Настоящая тема', 1, 'Д/з 1'],
      ['2', 'Разделка овощей', 1, 'Д/з 2'], // «разделка» — не раздел, а тема
      ['3', 'Повторение раздела', 1, 'Д/з 3'] // «раздела» — склонение, не заголовок
    ]
    const topics = rowsToTopics(rows)
    expect(topics.map((t) => t.title)).toEqual([
      'Тема 1. Настоящая тема',
      'Разделка овощей',
      'Повторение раздела'
    ])
    topics.forEach((t, i) => expect(t.orderIndex).toBe(i))
  })
})

describe('fillSlots', () => {
  function makeSlots(): ScheduleSlot[] {
    const slots: ScheduleSlot[] = []
    let id = 1
    for (let day = 1; day <= 5; day++) {
      for (let lesson = 1; lesson <= 3; lesson++) {
        slots.push({
          id: id++,
          dayOfWeek: day as ScheduleSlot['dayOfWeek'],
          lessonNumber: lesson,
          subjectName: lesson === 1 ? 'Домоводство' : 'Музыка и движение',
          topicId: null,
          isLocked: false
        })
      }
    }
    return slots
  }

  it('привязывает темы только к слотам выбранного предмета и блокирует их', () => {
    const slots = makeSlots()
    const topics = [
      { title: 'Т1', hours: 1, homework: '', orderIndex: 0, id: 101 },
      { title: 'Т2', hours: 1, homework: '', orderIndex: 1, id: 102 },
      { title: 'Т3', hours: 1, homework: '', orderIndex: 2, id: 103 }
    ]
    const { updatedSlots, placedCount, unplacedCount } = fillSlots(slots, topics, 'Домоводство')

    expect(placedCount).toBe(3)
    expect(unplacedCount).toBe(0)
    expect(updatedSlots).toHaveLength(3)
    // слоты выбранного предмета идут по (dayOfWeek, lessonNumber): дни 1,2,3 — урок 1
    expect(updatedSlots.map((s) => s.dayOfWeek)).toEqual([1, 2, 3])
    expect(updatedSlots.map((s) => s.topicId)).toEqual([101, 102, 103])
    expect(updatedSlots.every((s) => s.isLocked)).toBe(true)
  })

  it('лишние темы не размещаются и считаются в unplacedCount', () => {
    const slots = makeSlots() // 5 слотов «Домоводство»
    const topics = Array.from({ length: 7 }, (_, i) => ({
      title: `Т${i + 1}`,
      hours: 1,
      homework: '',
      orderIndex: i,
      id: i + 1
    }))
    const { updatedSlots, placedCount, unplacedCount } = fillSlots(slots, topics, 'Домоводство')
    expect(placedCount).toBe(5)
    expect(unplacedCount).toBe(2)
    expect(updatedSlots).toHaveLength(5)
  })
})
