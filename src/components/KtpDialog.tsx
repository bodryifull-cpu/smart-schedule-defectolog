import { useMemo, useState } from 'react'
import type { ParsedTopic } from '@/lib/parseKtp'
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

interface KtpDialogProps {
  open: boolean
  topics: ParsedTopic[]
  subjectNames: string[]
  onConfirm: (subjectName: string) => void
  onCancel: () => void
}

/** Модальный диалог: пользователь ОБЯЗАН выбрать предмет вручную. */
export function KtpDialog({ open, topics, subjectNames, onConfirm, onCancel }: KtpDialogProps) {
  const [selected, setSelected] = useState<string>('')
  const preview = useMemo(() => topics.slice(0, 3), [topics])

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) onCancel()
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Привязка КТП к предмету</DialogTitle>
          <DialogDescription>
            Найдено тем: {topics.length}. Выберите предмет из расписания, к урокам которого нужно
            привязать эти темы.
          </DialogDescription>
        </DialogHeader>

        {preview.length > 0 && (
          <div className="rounded-md border bg-muted/50 p-3 text-xs text-muted-foreground">
            <p className="mb-1 font-medium text-foreground">Первые темы:</p>
            <ul className="list-inside list-disc space-y-0.5">
              {preview.map((t) => (
                <li key={t.orderIndex}>{t.title}</li>
              ))}
            </ul>
          </div>
        )}

        <Select value={selected} onValueChange={setSelected}>
          <SelectTrigger>
            <SelectValue placeholder="Выберите предмет…" />
          </SelectTrigger>
          <SelectContent>
            {subjectNames.map((name) => (
              <SelectItem key={name} value={name}>
                {name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <DialogFooter>
          <Button variant="outline" onClick={onCancel}>
            Отмена
          </Button>
          <Button disabled={!selected} onClick={() => onConfirm(selected)}>
            Привязать темы
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
