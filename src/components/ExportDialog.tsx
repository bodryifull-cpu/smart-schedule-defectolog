import { useEffect, useState } from 'react'
import { Download } from 'lucide-react'
import { formatDateRu, type ExportFormat, type ExportVariant } from '@/lib/exportSchedule'
import { addDaysISO } from '@/lib/yearPlan'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'

interface ExportDialogProps {
  /** Понедельник выбранной недели (ISO) или null, когда диалог закрыт. */
  weekStart: string | null
  onConfirm: (format: ExportFormat, variant: ExportVariant) => void
  onCancel: () => void
}

/** Диалог выгрузки расписания недели: формат (DOCX/XLSX) + вариант (подробное/сокращённое). */
export function ExportDialog({ weekStart, onConfirm, onCancel }: ExportDialogProps) {
  const [format, setFormat] = useState<ExportFormat>('docx')
  const [variant, setVariant] = useState<ExportVariant>('detailed')

  useEffect(() => {
    if (weekStart != null) {
      setFormat('docx')
      setVariant('detailed')
    }
  }, [weekStart])

  return (
    <Dialog open={weekStart !== null} onOpenChange={(o) => !o && onCancel()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Выгрузить расписание</DialogTitle>
          <DialogDescription>
            {weekStart &&
              `Неделя ${formatDateRu(weekStart)} — ${formatDateRu(addDaysISO(weekStart, 6))}. `}
            В файл попадут предметы, темы и домашние задания с учётом переносов и изменений в
            расписании.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Формат файла</label>
            <Select value={format} onValueChange={(v) => setFormat(v as ExportFormat)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="docx">DOCX (Word)</SelectItem>
                <SelectItem value="xlsx">XLSX (Excel)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium">Вариант</label>
            <Select value={variant} onValueChange={(v) => setVariant(v as ExportVariant)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="detailed">
                  Подробное — отдельная таблица на каждый день (с домашними заданиями)
                </SelectItem>
                <SelectItem value="compact">
                  Сокращённое — одна таблица на всю неделю
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onCancel}>
            Отмена
          </Button>
          <Button onClick={() => onConfirm(format, variant)}>
            <Download /> Скачать
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
