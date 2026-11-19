// Генерация тестовых фикстур (dev-only, не входит в сборку):
//  fixtures/расписание.docx — таблица 5 дней × 8 уроков (с «кривыми» названиями предметов)
//  fixtures/5и домоводство.xls — лист Planirovanie с разделами и 59 темами
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { Document, Packer, Table, TableCell, TableRow, Paragraph, TextRun, WidthType } from 'docx'
import * as XLSX from 'xlsx'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const fixturesDir = path.join(__dirname, '..', 'fixtures')
fs.mkdirSync(fixturesDir, { recursive: true })

// ---------- расписание.docx ----------
// Первая строка — заголовок «5и класс» (игнорируется парсером).
// Далее 8 строк-уроков × 5 дней. Пт: уроки 7 и 8 пустые.
const header = ['5и класс', '', '', '', '']
const lessons = [
  ['Классный час', 'Разговоры о важн ом', 'Матем . Пред-я', 'Окр . соц . мир', 'Речь и альт. К.'],
  ['Матем . Пред-я', 'Матем. Пред-я', 'Речь и альт. К.', 'Домоводство', 'Окр. пр. мир'],
  ['Речь и альт. К.', 'Окр. пр. мир', 'Окр . соц . мир', 'Матем. Пред-я', 'Человек'],
  ['Адаптив . физ-ра', 'Домоводство', 'Музыка и движение', 'ИЗО', 'Коррекция'],
  ['Окр. пр. мир', 'Адаптив. физ-ра', 'Двиг. развитие', 'ППД', 'ВД'],
  ['Домоводство', 'Человек', 'Коррекция', 'Музыка и движение', 'Домоводство'],
  ['ИЗО', 'ППД', 'ВД', 'Двиг. развитие', ''],
  ['Музыка и движение', 'Коррекция', 'Человек', 'Адаптив . физ-ра', '']
]

function cell(text) {
  return new TableCell({
    children: [new Paragraph({ children: [new TextRun(text)] })]
  })
}

const doc = new Document({
  sections: [
    {
      children: [
        new Table({
          width: { size: 100, type: WidthType.PERCENTAGE },
          rows: [header, ...lessons].map((row) => new TableRow({ children: row.map(cell) }))
        })
      ]
    }
  ]
})

const docxBuffer = await Packer.toBuffer(doc)
const docxPath = path.join(fixturesDir, 'расписание.docx')
fs.writeFileSync(docxPath, docxBuffer)
console.log(`created ${docxPath}`)

// ---------- 5и домоводство.xls ----------
const aoa = [['№ п/п', 'Тема', 'Кол-во часов', 'Домашнее задание']]
let topicNo = 0
for (let section = 1; section <= 3; section++) {
  aoa.push(['', `Раздел ${section}`, '', ''])
  const count = section === 1 ? 20 : section === 2 ? 20 : 19 // итого 59 тем
  for (let i = 0; i < count; i++) {
    topicNo++
    aoa.push([String(topicNo), `Тема ${topicNo}. Пример темы урока`, 1, `Повторить тему ${topicNo}`])
  }
}
const ws = XLSX.utils.aoa_to_sheet(aoa)
const wb = XLSX.utils.book_new()
XLSX.utils.book_append_sheet(wb, ws, 'Planirovanie')
const xlsPath = path.join(fixturesDir, '5и домоводство.xls')
XLSX.writeFile(wb, xlsPath, { bookType: 'biff8' })
console.log(`created ${xlsPath}`)
