import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import { formatDateRu } from '@/components/LessonDetailsDialog'

interface DateMoveDialogProps {
  /** Дата-источник (ISO) или null, когда диалог закрыт. */
  fromDate: string | null
  /** Сколько занятий в этот день. */
  lessonsCount: number
  minDate: string
  maxDate: string
  onConfirm: (toDate: string) => void
  onCancel: () => void
}

/** Диалог переноса ВСЕХ занятий конкретной даты на другую дату учебного года. */
export function DateMoveDialog({
  fromDate,
  lessonsCount,
  minDate,
  maxDate,
  onConfirm,
  onCancel
}: DateMoveDialogProps) {
  const [target, setTarget] = useState('')

  useEffect(() => {
    if (fromDate != null) setTarget('')
  }, [fromDate])

  return (
    <Dialog open={fromDate !== null} onOpenChange={(o) => !o && onCancel()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            Перенести день{fromDate ? ` — ${formatDateRu(fromDate)}` : ''}
          </DialogTitle>
          <DialogDescription>
            Все занятия этого дня ({lessonsCount}) будут перенесены на выбранную дату. Недельное
            расписание при этом не меняется — переносится только этот день.
          </DialogDescription>
        </DialogHeader>

        <Input
          type="date"
          min={minDate}
          max={maxDate}
          value={target}
          onChange={(e) => setTarget(e.target.value)}
        />

        <DialogFooter>
          <Button variant="outline" onClick={onCancel}>
            Отмена
          </Button>
          <Button disabled={!target || target === fromDate} onClick={() => onConfirm(target)}>
            Перенести
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
