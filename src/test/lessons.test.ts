import { describe, expect, it } from 'vitest'
import {
  ktpLessonsOfWeek,
  lessonsOfWeek,
  matchToLessons,
  parseGenerated,
  systemPrompt,
  weekUserPrompt
} from '@/lib/lessonsService'
import type { YearOccurrence } from '@/lib/yearPlan'

function occ(date: string, slotId: number, lessonNumber: number): YearOccurrence {
  return { date, slotId, dayOfWeek: 1, lessonNumber, subjectName: 'Домоводство', topicId: null }
}

describe('lessonsOfWeek: временная фильтрация на уровне кода', () => {
  it('берёт занятия строго выбранной недели (пн–вс), сортирует по дате и номеру урока', () => {
    const occurrences = [
      occ('2024-09-01', 9, 1), // воскресенье ПРЕДЫДУЩЕЙ недели — не входит
      occ('2024-09-03', 2, 2),
      occ('2024-09-02', 1, 1),
      occ('2024-09-08', 3, 1), // воскресенье этой недели — входит
      occ('2024-09-09', 4, 1) // понедельник следующей — не входит
    ]
    const week = lessonsOfWeek(occurrences, '2024-09-02')
    expect(week.map((o) => o.date)).toEqual(['2024-09-02', '2024-09-03', '2024-09-08'])
  })
})

describe('ktpLessonsOfWeek: генерация только по занятиям с КТП', () => {
  const topics = new Map([
    [10, { id: 10, subjectName: 'Домоводство', title: 'Из КТП', hours: 1, homework: 'Д/з', orderIndex: 0 }],
    [11, { id: 11, subjectName: 'Домоводство', title: 'Сгенерированная', hours: 1, homework: '', orderIndex: 1, isGenerated: true }]
  ])

  it('оставляет только занятия с назначенной темой из загруженного КТП', () => {
    const week = ktpLessonsOfWeek(
      [
        { ...occ('2024-09-02', 1, 1), topicId: 10 }, // тема из КТП — входит
        { ...occ('2024-09-03', 2, 1), topicId: 11 }, // сгенерированная тема — не входит
        occ('2024-09-04', 3, 1), // без темы — не входит
        { ...occ('2024-09-05', 4, 1), topicId: 999 } // тема удалена — не входит
      ],
      '2024-09-02',
      topics
    )
    expect(week.map((o) => o.slotId)).toEqual([1])
  })
})

describe('systemPrompt', () => {
  it('содержит уровень и НЕ содержит дат/временной логики', () => {
    const p = systemPrompt('moderate')
    expect(p).toContain('умеренная УО')
    expect(p).not.toMatch(/\d{2}\.\d{2}\.\d{4}/)
    expect(systemPrompt('mild')).toContain('лёгкая УО')
  })
})

describe('weekUserPrompt', () => {
  it('перечисляет занятия с датами, днями недели и предметами', () => {
    const text = weekUserPrompt([occ('2024-09-02', 1, 2)])
    expect(text).toContain('02.09.2024')
    expect(text).toContain('Понедельник')
    expect(text).toContain('урок 2')
    expect(text).toContain('Домоводство')
    expect(text).toContain('тема КТП не задана')
    expect(text).toContain('Всего занятий: 1')
  })

  it('подставляет тему КТП, назначенную на занятие', () => {
    const lesson = { ...occ('2024-09-02', 1, 2), topicId: 7 }
    const topics = new Map([
      [7, { id: 7, subjectName: 'Домоводство', title: 'Сервировка стола', hours: 1, homework: '', orderIndex: 0 }]
    ])
    const text = weekUserPrompt([lesson], topics)
    expect(text).toContain('тема КТП: «Сервировка стола»')
  })
})

describe('parseGenerated + matchToLessons', () => {
  const llmAnswer = [
    '[02.09.2024] Тема: Сервировка стола',
    'Описание: Учимся накрывать на стол.',
    '[03.09.2024] Тема: Мытьё посуды',
    'Описание: Последовательность действий при мытье посуды.'
  ].join('\n')

  it('парсит блоки с датами', () => {
    const parsed = parseGenerated(llmAnswer)
    expect(parsed).toHaveLength(2)
    expect(parsed[0]).toMatchObject({ date: '02.09.2024', topic: 'Сервировка стола' })
    expect(parsed[1].description).toContain('мытье посуды')
  })

  it('толерантен к блокам без даты', () => {
    const parsed = parseGenerated('Тема: Обувь\nОписание: Завязываем шнурки.')
    expect(parsed).toEqual([{ date: undefined, topic: 'Обувь', description: 'Завязываем шнурки.' }])
  })

  it('понимает метку «План» наравне с «Описание»', () => {
    const parsed = parseGenerated('[02.09.2024] Тема: Сервировка стола\nПлан: 1. Введение. 2. Практика.')
    expect(parsed).toEqual([
      { date: '02.09.2024', topic: 'Сервировка стола', description: '1. Введение. 2. Практика.' }
    ])
  })

  it('устойчив к markdown-разметке и code-фенсам', () => {
    const text = [
      '```',
      '**[02.09.2024] Тема: Сервировка стола**',
      '**План:** 1. Введение. 2. Практика.',
      '',
      '**[03.09.2024] Тема: Мытьё посуды**',
      '**План урока:** 1. Демонстрация. 2. Самостоятельно.',
      '```'
    ].join('\n')
    const parsed = parseGenerated(text)
    expect(parsed).toHaveLength(2)
    expect(parsed[0]).toMatchObject({ date: '02.09.2024', topic: 'Сервировка стола' })
    expect(parsed[1]).toMatchObject({ date: '03.09.2024', topic: 'Мытьё посуды' })
    expect(parsed[0].description).toContain('Практика')
  })

  it('устойчив к нумерации блоков и датам без скобок', () => {
    const text = [
      '1. 02.09.2024 Тема: Сервировка стола',
      'План: 1. Введение.',
      '2. 03.09.2024 Тема: Мытьё посуды',
      'План: 1. Демонстрация.'
    ].join('\n')
    const parsed = parseGenerated(text)
    expect(parsed).toHaveLength(2)
    expect(parsed[0]).toMatchObject({ date: '02.09.2024', topic: 'Сервировка стола' })
    expect(parsed[1]).toMatchObject({ date: '03.09.2024', topic: 'Мытьё посуды' })
    // нумерация следующего блока не должна попадать в план предыдущего
    expect(parsed[0].description).not.toContain('2.')
  })

  it('сопоставляет с занятиями по датам, остаток — по порядку', () => {
    const lessons = [occ('2024-09-02', 1, 1), occ('2024-09-03', 2, 1)]
    const items = matchToLessons(parseGenerated(llmAnswer), lessons)
    expect(items).toEqual([
      { slotId: 1, date: '2024-09-02', topic: 'Сервировка стола', description: 'Учимся накрывать на стол.', topicId: null },
      { slotId: 2, date: '2024-09-03', topic: 'Мытьё посуды', description: 'Последовательность действий при мытье посуды.', topicId: null }
    ])
  })

  it('лишние блоки без занятий отбрасываются', () => {
    const lessons = [occ('2024-09-02', 1, 1)]
    const items = matchToLessons(parseGenerated(llmAnswer), lessons)
    expect(items).toHaveLength(1)
  })
})
