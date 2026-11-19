// Генерация планов занятий через GigaChat на основе тем КТП в расписании.
// ВАЖНО: временная фильтрация (какие занятия попадают в запрос) выполняется
// ТОЛЬКО здесь, кодом — в промпте никакой логики про даты нет.
import { chatCompletion } from '@/lib/gigachatService'
import { formatDateRu } from '@/lib/exportSchedule'
import { addDaysISO, type YearOccurrence } from '@/lib/yearPlan'
import { DAY_NAMES_FULL, type CurriculumTopic, type GigaChatSettings, type Severity } from '@/types'

export interface GeneratedLessonItem {
  slotId: number
  date: string // ISO
  topic: string
  /** Текст плана урока (записывается в поле lessonPlan темы; Д/з не затрагивается). */
  description: string
  /** Тема КТП, уже назначенная на занятие (null — темы не было, будет создана сгенерированная). */
  topicId: number | null
}

export type WeekGenerationResult =
  | { status: 'no_lessons' }
  | { status: 'ok'; items: GeneratedLessonItem[] }

export const SEVERITY_LABELS: Record<Severity, string> = {
  mild: 'лёгкая УО',
  moderate: 'умеренная УО'
}

/** Занятия строго выбранной недели (понедельник–воскресенье), по порядку. */
export function lessonsOfWeek(occurrences: YearOccurrence[], weekStart: string): YearOccurrence[] {
  const weekEnd = addDaysISO(weekStart, 6)
  return occurrences
    .filter((o) => o.date >= weekStart && o.date <= weekEnd)
    .sort((a, b) =>
      a.date < b.date ? -1 : a.date > b.date ? 1 : a.lessonNumber - b.lessonNumber
    )
}

/** Занятия недели, по которым загружено КТП: тема назначена и не является
 *  сгенерированной (isGenerated). Только для таких занятий имеет смысл
 *  генерация плана урока — по теме из КТП. */
export function ktpLessonsOfWeek(
  occurrences: YearOccurrence[],
  weekStart: string,
  topics?: Map<number, CurriculumTopic>
): YearOccurrence[] {
  return lessonsOfWeek(occurrences, weekStart).filter((o) => {
    if (o.topicId == null) return false
    const topic = topics?.get(o.topicId)
    return topic != null && topic.isGenerated !== true
  })
}

/** Системный промпт — БЕЗ временной логики. */
export function systemPrompt(severity: Severity): string {
  const label = SEVERITY_LABELS[severity]
  return [
    'Вы — дефектолог-консультант. Вам предоставлены занятия на текущую неделю.',
    'Для каждого занятия может быть указана тема КТП, назначенная в расписании.',
    `Если тема КТП указана — сохраните её без изменений в поле «Тема» и составьте примерный краткий план урока по этой теме с учётом уровня «${label}».`,
    'Если тема КТП не указана — предложите подходящую тему с учётом предмета и уровня, затем дайте план урока.',
    'Для легкой УО: социализация, бытовые навыки, коммуникация.',
    'Для умеренной УО: сенсорно-перцептивные действия, моторика, простые инструкции.',
    'План — 3–5 коротких пунктов (этапы урока), без вводных слов.',
    'Ответьте отдельным блоком для КАЖДОГО занятия из списка — не пропускайте и не объединяйте занятия.',
    'Отвечайте без markdown-разметки: без **, # и ```.',
    'Формат строго:',
    '[Дата в формате ДД.ММ.ГГГГ] Тема: [...]',
    'План: [...]'
  ].join('\n')
}

function lessonLine(o: YearOccurrence, topicTitle?: string): string {
  const dayName = DAY_NAMES_FULL[o.dayOfWeek]
  const ktp = topicTitle ? `, тема КТП: «${topicTitle}»` : ', тема КТП не задана'
  return `— ${formatDateRu(o.date)} (${dayName}), урок ${o.lessonNumber}: ${o.subjectName}${ktp}`
}

export function weekUserPrompt(
  lessons: YearOccurrence[],
  topics?: Map<number, CurriculumTopic>
): string {
  return (
    'Занятия недели:\n' +
    lessons
      .map((o) => lessonLine(o, o.topicId != null ? topics?.get(o.topicId)?.title : undefined))
      .join('\n') +
    `\n\nВсего занятий: ${lessons.length}. Дайте ровно ${lessons.length} блоков — ` +
    'по одному на каждое занятие, в том же порядке и с теми же датами.'
  )
}

export function singleUserPrompt(occ: YearOccurrence, topic?: CurriculumTopic): string {
  return 'Занятие:\n' + lessonLine(occ, topic?.title)
}

/** Разбор ответа LLM: блоки «[ДД.ММ.ГГГГ] Тема: … План: …».
 *  Толерантен к вольностям модели: markdown (жирный текст), code-фенсы,
 *  нумерация блоков, дата без скобок, метки «План урока»/«Примерный план»/«Описание»,
 *  разный регистр. */
export function parseGenerated(text: string): Array<{ date?: string; topic: string; description: string }> {
  // Нормализация: GigaChat любит выделять «Тема:»/«План:» жирным, заворачивать
  // ответ в ``` и нумеровать блоки («1. [дата] Тема: …») — всё это мешало разбору,
  // и часть блоков терялась. Нумерацию снимаем только со строк, содержащих «Тема:».
  const normalized = text
    .replace(/```[^\n]*\n?/g, '')
    .replace(/\*\*|__/g, '')
    .replace(/^\s*\d{1,2}[.)]\s+(?=.*Тема\s*:)/gm, '')
  const DATE = '\\d{2}\\.\\d{2}\\.\\d{4}'
  const re = new RegExp(
    `(?:\\[\\s*(${DATE})\\s*\\]|\\b(${DATE})\\b)?[ \\t]*Тема\\s*:\\s*(.+?)[\\r\\n]+\\s*` +
      `(?:Примерный\\s+)?(?:План(?:\\s+урока)?|Описание)\\s*:\\s*([\\s\\S]*?)` +
      `(?=\\s*(?:\\[?${DATE}\\]?\\s*)?Тема\\s*:|$)`,
    'gi'
  )
  const items: Array<{ date?: string; topic: string; description: string }> = []
  let m: RegExpExecArray | null
  while ((m = re.exec(normalized)) !== null) {
    const topic = m[3].replace(/^#+\s*/, '').trim()
    const description = m[4].trim()
    if (!topic) continue
    items.push({ date: m[1] ?? m[2], topic, description })
  }
  return items
}

function toIso(ddmmyyyy: string): string {
  const [d, m, y] = ddmmyyyy.split('.')
  return `${y}-${m}-${d}`
}

/** Сопоставление распарсенных блоков с занятиями: по дате, внутри дня — по порядку уроков. */
export function matchToLessons(
  parsed: Array<{ date?: string; topic: string; description: string }>,
  lessons: YearOccurrence[]
): GeneratedLessonItem[] {
  const remaining = [...lessons]
  const items: GeneratedLessonItem[] = []
  for (const p of parsed) {
    let occ: YearOccurrence | undefined
    if (p.date) {
      const iso = toIso(p.date)
      const idx = remaining.findIndex((o) => o.date === iso)
      if (idx >= 0) occ = remaining.splice(idx, 1)[0]
    }
    if (!occ) occ = remaining.shift()
    if (!occ) break
    items.push({
      slotId: occ.slotId,
      date: occ.date,
      topic: p.topic,
      description: p.description,
      topicId: occ.topicId
    })
  }
  return items
}

/** Генерация планов для занятий выбранной недели, по которым загружено КТП.
 *  Занятия без темы КТП пропускаются. Отмена — через AbortSignal. */
export async function generateWeekTopics(
  occurrences: YearOccurrence[],
  weekStart: string,
  settings: GigaChatSettings,
  signal?: AbortSignal,
  topics?: Map<number, CurriculumTopic>
): Promise<WeekGenerationResult> {
  const lessons = ktpLessonsOfWeek(occurrences, weekStart, topics)
  if (lessons.length === 0) return { status: 'no_lessons' }
  const content = await chatCompletion(
    settings,
    [
      { role: 'system', content: systemPrompt(settings.severity) },
      { role: 'user', content: weekUserPrompt(lessons, topics) }
    ],
    signal
  )
  return { status: 'ok', items: matchToLessons(parseGenerated(content), lessons) }
}

/** Генерация плана для одного занятия (по теме КТП, если она назначена). Отмена — через AbortSignal. */
export async function generateSingleTopic(
  occ: YearOccurrence,
  settings: GigaChatSettings,
  signal?: AbortSignal,
  topic?: CurriculumTopic
): Promise<GeneratedLessonItem> {
  const content = await chatCompletion(
    settings,
    [
      { role: 'system', content: systemPrompt(settings.severity) },
      { role: 'user', content: singleUserPrompt(occ, topic) }
    ],
    signal
  )
  const parsed = parseGenerated(content)
  const first = parsed[0] ?? {
    topic: topic?.title ?? content.trim().split('\n')[0] ?? 'Тема занятия',
    description: content.trim()
  }
  return {
    slotId: occ.slotId,
    date: occ.date,
    topic: first.topic,
    description: first.description,
    topicId: occ.topicId
  }
}
