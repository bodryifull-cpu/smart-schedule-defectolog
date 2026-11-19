// Выгрузка расписания выбранной недели в DOCX / XLSX.
import {
  Document,
  HeadingLevel,
  Packer,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType
} from 'docx'
import * as XLSX from 'xlsx'
import { addDaysISO, type YearOccurrence } from '@/lib/yearPlan'
import { DAY_NAMES, DAY_NAMES_FULL, type CurriculumTopic } from '@/types'

export type ExportFormat = 'docx' | 'xlsx'
/** detailed — каждая таблица = отдельный день; compact — одна таблица на всю неделю. */
export type ExportVariant = 'detailed' | 'compact'

export interface ExportLesson {
  lessonNumber: number
  subjectName: string
  topicNumber?: number
  topicTitle?: string
  homework?: string
}

export interface WeekExportDay {
  date: string // ISO
  dow: number // 1..7 — фактический день недели даты
  lessons: ExportLesson[]
}

export function formatDateRu(iso: string): string {
  const [y, m, d] = iso.split('-')
  return `${d}.${m}.${y}`
}

/** Занятия недели (уже с учётом переносов и изменений в расписании) → структура для экспорта. */
export function buildWeekExport(
  occurrences: YearOccurrence[],
  topics: CurriculumTopic[],
  weekStart: string
): WeekExportDay[] {
  const topicById = new Map(topics.map((t) => [t.id, t]))
  const days: WeekExportDay[] = []
  for (let dow = 1; dow <= 7; dow++) {
    const date = addDaysISO(weekStart, dow - 1)
    const lessons = occurrences
      .filter((o) => o.date === date)
      .sort((a, b) => a.lessonNumber - b.lessonNumber)
      .map((o): ExportLesson => {
        const t = o.topicId != null ? topicById.get(o.topicId) : undefined
        return {
          lessonNumber: o.lessonNumber,
          subjectName: o.subjectName,
          topicNumber: t ? t.orderIndex + 1 : undefined,
          topicTitle: t?.title,
          homework: t?.homework || undefined
        }
      })
    days.push({ date, dow, lessons })
  }
  return days
}

function lessonCellText(l: ExportLesson, withHomework: boolean): string {
  let text = l.subjectName
  if (l.topicTitle) text += `\n${l.topicNumber}. ${l.topicTitle}`
  if (withHomework && l.homework) text += `\nД/з: ${l.homework}`
  return text
}

// ---------- DOCX ----------

function cellParagraphs(text: string): Paragraph[] {
  return text.split('\n').map(
    (line, i) =>
      new Paragraph({
        children: [new TextRun({ text: line, bold: i === 0, size: 20 })]
      })
  )
}

function docxCell(text: string, width?: number): TableCell {
  return new TableCell({
    width: width ? { size: width, type: WidthType.PERCENTAGE } : undefined,
    children: cellParagraphs(text)
  })
}

function buildDocxDetailed(days: WeekExportDay[], weekStart: string): Document {
  const children: (Paragraph | Table)[] = [
    new Paragraph({
      heading: HeadingLevel.HEADING_1,
      children: [
        new TextRun(
          `Расписание на неделю ${formatDateRu(weekStart)} — ${formatDateRu(addDaysISO(weekStart, 6))}`
        )
      ]
    })
  ]
  for (const day of days) {
    if (day.lessons.length === 0) continue
    children.push(
      new Paragraph({
        heading: HeadingLevel.HEADING_2,
        spacing: { before: 300 },
        children: [new TextRun(`${DAY_NAMES_FULL[day.dow]}, ${formatDateRu(day.date)}`)]
      }),
      new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        rows: [
          new TableRow({
            tableHeader: true,
            children: ['№', 'Предмет', 'Тема', 'Домашнее задание'].map(
              (h) =>
                new TableCell({
                  children: [
                    new Paragraph({ children: [new TextRun({ text: h, bold: true, size: 20 })] })
                  ]
                })
            )
          }),
          ...day.lessons.map(
            (l) =>
              new TableRow({
                children: [
                  docxCell(String(l.lessonNumber)),
                  docxCell(l.subjectName),
                  docxCell(l.topicTitle ? `${l.topicNumber}. ${l.topicTitle}` : ''),
                  docxCell(l.homework ?? '')
                ]
              })
          )
        ]
      })
    )
  }
  return new Document({ sections: [{ children }] })
}

function buildDocxCompact(days: WeekExportDay[], weekStart: string): Document {
  const maxLesson = Math.max(0, ...days.flatMap((d) => d.lessons.map((l) => l.lessonNumber)))
  const rows: TableRow[] = [
    new TableRow({
      tableHeader: true,
      children: [
        docxCell('Урок'),
        ...days.map((d) => docxCell(`${DAY_NAMES[d.dow]}\n${formatDateRu(d.date)}`))
      ]
    })
  ]
  for (let lesson = 1; lesson <= maxLesson; lesson++) {
    rows.push(
      new TableRow({
        children: [
          docxCell(String(lesson)),
          ...days.map((d) => {
            const l = d.lessons.find((x) => x.lessonNumber === lesson)
            return docxCell(l ? lessonCellText(l, false) : '')
          })
        ]
      })
    )
  }
  return new Document({
    sections: [
      {
        children: [
          new Paragraph({
            heading: HeadingLevel.HEADING_1,
            children: [
              new TextRun(
                `Расписание на неделю ${formatDateRu(weekStart)} — ${formatDateRu(addDaysISO(weekStart, 6))}`
              )
            ]
          }),
          new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows })
        ]
      }
    ]
  })
}

// ---------- XLSX ----------

function buildSheetAoa(days: WeekExportDay[], weekStart: string, variant: ExportVariant): unknown[][] {
  const aoa: unknown[][] = [
    [`Расписание на неделю ${formatDateRu(weekStart)} — ${formatDateRu(addDaysISO(weekStart, 6))}`]
  ]
  if (variant === 'compact') {
    const maxLesson = Math.max(0, ...days.flatMap((d) => d.lessons.map((l) => l.lessonNumber)))
    aoa.push(['Урок', ...days.map((d) => `${DAY_NAMES[d.dow]} ${formatDateRu(d.date)}`)])
    for (let lesson = 1; lesson <= maxLesson; lesson++) {
      aoa.push([
        lesson,
        ...days.map((d) => {
          const l = d.lessons.find((x) => x.lessonNumber === lesson)
          return l ? lessonCellText(l, false) : ''
        })
      ])
    }
    return aoa
  }
  // detailed: блок на каждый день
  for (const day of days) {
    if (day.lessons.length === 0) continue
    aoa.push([], [`${DAY_NAMES_FULL[day.dow]}, ${formatDateRu(day.date)}`], ['№', 'Предмет', 'Тема', 'Домашнее задание'])
    for (const l of day.lessons) {
      aoa.push([
        l.lessonNumber,
        l.subjectName,
        l.topicTitle ? `${l.topicNumber}. ${l.topicTitle}` : '',
        l.homework ?? ''
      ])
    }
  }
  return aoa
}

// ---------- Скачивание / сохранение ----------

// Веб: скачивание через ссылку. Android (Capacitor): WebView не скачивает blob —
// сохраняем файл в общедоступную папку «Документы» (иначе — во внутреннюю папку приложения).
import { Capacitor } from '@capacitor/core'
import { Directory, Filesystem } from '@capacitor/filesystem'

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(new Error('Не удалось прочитать файл выгрузки'))
    reader.onload = () => {
      const dataUrl = String(reader.result)
      resolve(dataUrl.slice(dataUrl.indexOf(',') + 1))
    }
    reader.readAsDataURL(blob)
  })
}

/** Сохраняет файл; возвращает человекочитаемое место сохранения. */
async function saveFile(blob: Blob, filename: string): Promise<string> {
  if (Capacitor.isNativePlatform()) {
    const data = await blobToBase64(blob)
    try {
      await Filesystem.writeFile({ path: filename, data, directory: Directory.Documents })
      return `${filename} (папка «Документы»)`
    } catch {
      await Filesystem.writeFile({ path: filename, data, directory: Directory.ExternalStorage })
      return `${filename} (Android/data/ru.defectolog.smartschedule/files)`
    }
  }
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
  return filename
}

/** Генерация и скачивание файла расписания недели. */
export async function exportWeekSchedule(
  occurrences: YearOccurrence[],
  topics: CurriculumTopic[],
  weekStart: string,
  format: ExportFormat,
  variant: ExportVariant
): Promise<string> {
  const days = buildWeekExport(occurrences, topics, weekStart)
  const baseName = `расписание_${weekStart}_${addDaysISO(weekStart, 6)}`

  if (format === 'docx') {
    const doc = variant === 'detailed' ? buildDocxDetailed(days, weekStart) : buildDocxCompact(days, weekStart)
    const blob = await Packer.toBlob(doc)
    const filename = `${baseName}.docx`
    return saveFile(blob, filename)
  }

  const aoa = buildSheetAoa(days, weekStart, variant)
  const ws = XLSX.utils.aoa_to_sheet(aoa)
  ws['!cols'] = variant === 'compact' ? [{ wch: 6 }, ...days.map(() => ({ wch: 28 }))] : [{ wch: 5 }, { wch: 22 }, { wch: 40 }, { wch: 40 }]
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Расписание')
  const out = XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer
  const filename = `${baseName}.xlsx`
  return saveFile(
    new Blob([out], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }),
    filename
  )
}
