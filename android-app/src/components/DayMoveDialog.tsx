import { useEffect, useState } from 'react'
import { DAY_NAMES_FULL, WEEK_DAYS } from '@/types'
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

interface DayMoveDialogProps {
  /** День-источник (1..7) или null, когда диалог закрыт. */
  fromDay: number | null
  /** Есть ли уроки в каждом из дней (для подсказки про обмен). */
  daysWithSlots: Set<number>
  onConfirm: (toDay: number) => void
  onCancel: () => void
}

/** Диалог переноса всех уроков дня на другой день недели. */
export function DayMoveDialog({ fromDay, daysWithSlots, onConfirm, onCancel }: DayMoveDialogProps) {
  const [target, setTarget] = useState<string>('')

  useEffect(() => {
    if (fromDay != null) setTarget('')
  }, [fromDay])

  const targetDay = Number(target)

  return (
    <Dialog open={fromDay !== null} onOpenChange={(o) => !o && onCancel()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            Перенести день{fromDay != null ? ` — ${DAY_NAMES_FULL[fromDay]}` : ''}
          </DialogTitle>
          <DialogDescription>
            {target && targetDay !== fromDay && daysWithSlots.has(targetDay)
              ? `В выбранный день (${DAY_NAMES_FULL[targetDay]}) уже есть уроки — дни поменяются местами (уроки сохранят свои номера).`
              : 'Все уроки дня будут перенесены в выбранный день. Заблокированные уроки переносятся тоже.'}
          </DialogDescription>
        </DialogHeader>

        <Select value={target} onValueChange={setTarget}>
          <SelectTrigger>
            <SelectValue placeholder="Выберите день…" />
          </SelectTrigger>
          <SelectContent>
            {WEEK_DAYS.filter((d) => d !== fromDay).map((d) => (
              <SelectItem key={d} value={String(d)}>
                {DAY_NAMES_FULL[d]}
                {daysWithSlots.has(d) ? ' (обмен)' : ''}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <DialogFooter>
          <Button variant="outline" onClick={onCancel}>
            Отмена
          </Button>
          <Button disabled={!target} onClick={() => onConfirm(targetDay)}>
            Перенести
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
