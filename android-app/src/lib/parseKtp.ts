// Парсинг КТП из XLS (SheetJS). Чистые функции — работают и в node.
import * as XLSX from 'xlsx'

export interface ParsedTopic {
  title: string
  hours: number
  homework: string
  orderIndex: number
}

// «Раздел» как отдельное слово (не «разделка» и не «раздела»): после слова не должно быть буквы.
const SECTION_RE = /раздел(?![а-яё])/i

/**
 * Строки листа (header:1) → темы.
 * Пропускаем: заголовок таблицы, пустые строки, строки-разделы
 * («Раздел 1», «1. Раздел 2. …», «Раздел» в колонке № и т.п.).
 */
export function rowsToTopics(rows: unknown[][]): ParsedTopic[] {
  const topics: ParsedTopic[] = []
  for (const row of rows) {
    const num = String(row[0] ?? '').trim()
    const title = String(row[1] ?? '').replace(/\s+/g, ' ').trim()
    const hoursRaw = row[2]
    const homework = String(row[3] ?? '').replace(/\s+/g, ' ').trim()

    if (!title) continue // пустая строка
    if (title === 'Тема' || num === '№ п/п') continue // заголовок таблицы
    if (SECTION_RE.test(title) || SECTION_RE.test(num)) continue // раздел — не тема

    const hours = Number(hoursRaw)
    topics.push({
      title,
      hours: Number.isFinite(hours) && hours > 0 ? hours : 1,
      homework,
      orderIndex: topics.length
    })
  }
  return topics
}

/** Полный пайплайн: ArrayBuffer XLS → темы с листа «Planirovanie». */
export function parseKtpXls(arrayBuffer: ArrayBuffer): ParsedTopic[] {
  const wb = XLSX.read(arrayBuffer, { type: 'array' })
  const ws = wb.Sheets['Planirovanie']
  if (!ws) {
    throw new Error('В файле не найден лист «Planirovanie»')
  }
  const rows = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: '' })
  return rowsToTopics(rows)
}
