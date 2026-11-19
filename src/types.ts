export interface ScheduleSlot {
  id?: number
  dayOfWeek: 1 | 2 | 3 | 4 | 5 | 6 | 7 // Пн..Вс
  lessonNumber: number // 1..8 (вручную можно добавить и больше)
  subjectName: string // normalized
  topicId: number | null
  isLocked: boolean
  /** true — слот добавлен вручную (а не из файла расписания). */
  isManual?: boolean
}

export interface CurriculumTopic {
  id?: number
  subjectName: string
  title: string
  hours: number
  /** Домашнее задание из КТП (GigaChat его НЕ меняет). */
  homework: string
  /** Примерный план урока — генерируется GigaChat или заполняется вручную. Отдельно от Д/з. */
  lessonPlan?: string
  orderIndex: number
  /** true — тема сгенерирована GigaChat (не из файла КТП). */
  isGenerated?: boolean
}

/** Тяжесть нарушения для генерации тем GigaChat. */
export type Severity = 'mild' | 'moderate'

/** Настройки подключения GigaChat (хранятся локально в meta). */
export interface GigaChatSettings {
  clientId: string
  /** Authorization Key из кабинета Studio (используется напрямую, secret отдельно не нужен). */
  authorizationKey: string
  scope: 'GIGACHAT_API_PERS' | 'GIGACHAT_API_B2B' | 'GIGACHAT_API_CORP'
  /** Базовый хост API; по умолчанию единый адрес https://api.giga.chat. */
  host: string
  /** Модель выбирается автоматически при проверке подключения (самая новая). */
  model: string
  severity: Severity
  /** Модели, полученные при последней проверке подключения. */
  models?: string[]
  /** true — кнопки «GigaChat помоги» скрыты в остальных представлениях. */
  hidden?: boolean
}

export type HolidayKind = 'vacation' | 'holiday'

export interface Holiday {
  id?: number
  title: string
  startDate: string // ISO yyyy-mm-dd, включительно
  endDate: string // ISO yyyy-mm-dd, включительно
  /** 'vacation' — каникулы (период), 'holiday' — праздничный день (startDate = endDate). */
  kind: HolidayKind
}

export interface MetaEntry {
  key: string
  value: unknown
}

/** Перенос конкретного занятия (слота) с исходной даты на другую дату учебного года. */
export interface LessonMove {
  id?: number
  slotId: number
  /** Исходная дата занятия по недельному шаблону (ISO). */
  fromDate: string
  /** Новая дата занятия (ISO). */
  toDate: string
}

/** Закрепление темы КТП за конкретным занятием. Закреплённые темы не сдвигаются
 *  при изменении расписания; незакреплённые назначаются автоматически по порядку. */
export interface TopicPin {
  id?: number
  topicId: number
  /** Дата занятия (ISO). */
  date: string
  /** Конкретный слот (урок) в этот день; у старых записей может отсутствовать —
   *  тогда пин действует на первое свободное занятие предмета в этот день. */
  slotId?: number
}

/** Перенос учебного дня: в дату date действует расписание другого дня недели.
 *  Например: суббота 20.02 по расписанию понедельника. */
export interface DayOverride {
  id?: number
  /** Конкретная дата (ISO). */
  date: string
  /** Чьё расписание действует: 1=Пн … 7=Вс. */
  asDayOfWeek: 1 | 2 | 3 | 4 | 5 | 6 | 7
}

export const DAY_NAMES: Record<number, string> = {
  1: 'Пн',
  2: 'Вт',
  3: 'Ср',
  4: 'Чт',
  5: 'Пт',
  6: 'Сб',
  7: 'Вс'
}

export const DAY_NAMES_FULL: Record<number, string> = {
  1: 'Понедельник',
  2: 'Вторник',
  3: 'Среда',
  4: 'Четверг',
  5: 'Пятница',
  6: 'Суббота',
  7: 'Воскресенье'
}

export const WEEK_DAYS = [1, 2, 3, 4, 5, 6, 7] as const

export const LESSON_NUMBERS = [1, 2, 3, 4, 5, 6, 7, 8] as const
