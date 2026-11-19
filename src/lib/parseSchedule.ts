// Парсинг расписания из DOCX (mammoth → HTML → таблица).
// Чистые функции: работают и в браузере, и в node (для тестов).
import mammoth from 'mammoth/mammoth.browser'
import { normalizeSubject } from '@/lib/normalize'
import type { ScheduleSlot } from '@/types'

function decodeEntities(text: string): string {
  return text
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
}

/**
 * Разбор HTML, сгенерированного mammoth: берём ПЕРВУЮ таблицу,
 * возвращаем массив строк, каждая строка — массив текстов ячеек.
 * Регулярки достаточно: mammoth генерирует простой <table><tr><td>…</td></tr></table>.
 */
export function extractTableRows(html: string): string[][] {
  const tableMatch = html.match(/<table[^>]*>([\s\S]*?)<\/table>/i)
  if (!tableMatch) return []
  const tableHtml = tableMatch[1]
  const rows: string[][] = []
  const rowRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/gi
  let rowMatch: RegExpExecArray | null
  while ((rowMatch = rowRegex.exec(tableHtml)) !== null) {
    const cells: string[] = []
    const cellRegex = /<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi
    let cellMatch: RegExpExecArray | null
    while ((cellMatch = cellRegex.exec(rowMatch[1])) !== null) {
      const text = decodeEntities(cellMatch[1].replace(/<[^>]+>/g, ''))
      cells.push(text)
    }
    rows.push(cells)
  }
  return rows
}

/** Дни недели → dayOfWeek (для распознавания строки-заголовка и разметки колонок). */
const WEEKDAY_ALIASES: Record<string, number> = {
  'пн': 1, 'понедельник': 1,
  'вт': 2, 'вторник': 2,
  'ср': 3, 'среда': 3,
  'чт': 4, 'четверг': 4,
  'пт': 5, 'пятница': 5,
  'сб': 6, 'суббота': 6,
  'вс': 7, 'воскресенье': 7
}

function weekdayOf(text: string): number | undefined {
  const key = text.trim().toLowerCase().replace(/\.+$/, '')
  return WEEKDAY_ALIASES[key]
}

/** Убирает порядковый номер урока из текста ячейки: «1. Домоводство» → «Домоводство». */
function stripLessonPrefix(text: string): string {
  return text.replace(/^\s*\d{1,2}\s*[.)]\s*/, '')
}

/** Текст ячейки → нормализованное название предмета ('' — если это не предмет). */
function cellToSubject(raw: string): string {
  const stripped = stripLessonPrefix(raw)
  if (/^\s*\d{1,2}\s*$/.test(stripped)) return '' // ячейка — просто номер урока
  if (weekdayOf(stripped) !== undefined) return '' // ячейка — название дня недели
  return normalizeSubject(stripped)
}

/** Строка — заголовок/мусор, если это подпись класса («5и класс») или названия дней недели. */
function isHeaderRow(cells: string[]): boolean {
  const nonEmpty = cells.filter((c) => c.trim() !== '')
  if (nonEmpty.length === 0) return false
  // Подпись класса — короткая строка (объединённая ячейка), не путать с предметом «Классный час».
  if (
    nonEmpty.length <= 2 &&
    nonEmpty.some((c) => /класс/i.test(c) && !/классный час/i.test(c))
  ) {
    return true
  }
  return nonEmpty.filter((c) => weekdayOf(stripLessonPrefix(c)) !== undefined).length >= 3
}

/**
 * Строки таблицы → слоты расписания.
 * Пропускаются: строка «5и класс», строка с названиями дней недели.
 * Из названий предметов удаляются префиксы-номера («1. Домоводство» → «Домоводство»).
 * Колонки дней определяются по строке-заголовку с днями недели; если её нет —
 * по эвристике (первая колонка с номерами уроков пропускается).
 * Пустые ячейки не создают слотов.
 */
export function rowsToSlots(rows: string[][]): ScheduleSlot[] {
  // 1) Ищем строку-заголовок с днями недели → точная карта колонок (день → индекс).
  let dayCols: Array<{ day: number; col: number }> | null = null
  for (const cells of rows) {
    const found: Array<{ day: number; col: number }> = []
    cells.forEach((cell, col) => {
      const day = weekdayOf(stripLessonPrefix(cell))
      if (day !== undefined && !found.some((f) => f.day === day)) {
        found.push({ day, col })
      }
    })
    if (found.length >= 3) {
      dayCols = found
      break
    }
  }
  // 2) Нет заголовка — эвристика: если первая колонка строк данных состоит из
  //    номеров уроков / пустая, дни начинаются со второй колонки.
  if (!dayCols) {
    const dataRow = rows.find((cells) => !isHeaderRow(cells) && cells.some((c) => cellToSubject(c)))
    const firstIsNumbers =
      dataRow !== undefined && (dataRow[0] ?? '').trim() !== '' && cellToSubject(dataRow[0] ?? '') === ''
    const offset = firstIsNumbers ? 1 : 0
    dayCols = [1, 2, 3, 4, 5].map((day) => ({ day, col: day - 1 + offset }))
  }

  const slots: ScheduleSlot[] = []
  const dayColIndexes = new Set(dayCols.map((d) => d.col))
  let nextLesson = 0
  for (const cells of rows) {
    if (isHeaderRow(cells)) continue
    if (!cells.some((c) => cellToSubject(c))) continue // строка без предметов
    // Номер урока: берём из колонки с числами (если есть), иначе — по порядку строки.
    const numbered = cells.find((c, col) => !dayColIndexes.has(col) && /^\s*\d{1,2}\s*$/.test(c))
    const parsed = numbered !== undefined ? parseInt(numbered, 10) : NaN
    const lessonNumber = parsed >= 1 && parsed <= 8 ? parsed : (nextLesson += 1)
    nextLesson = Math.max(nextLesson, lessonNumber)
    if (lessonNumber > 8) break
    for (const { day, col } of dayCols) {
      const subjectName = cellToSubject(cells[col] ?? '')
      if (!subjectName) continue // пустая ячейка — слота нет
      slots.push({
        dayOfWeek: day as ScheduleSlot['dayOfWeek'],
        lessonNumber,
        subjectName,
        topicId: null,
        isLocked: false
      })
    }
  }
  return slots
}

/** Полный пайплайн: ArrayBuffer DOCX → слоты. */
export async function parseScheduleDocx(arrayBuffer: ArrayBuffer): Promise<ScheduleSlot[]> {
  const result = await mammoth.convertToHtml({ arrayBuffer })
  const rows = extractTableRows(result.value)
  if (rows.length === 0) {
    throw new Error('В документе не найдена таблица расписания')
  }
  return rowsToSlots(rows)
}
