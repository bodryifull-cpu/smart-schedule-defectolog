import { useState } from 'react'
import { DAY_NAMES_FULL } from '@/types'
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'

const NEW_SUBJECT = '__new__'

interface AddSlotDialogProps {
  open: boolean
  dayOfWeek: number | null
  lessonNumber: number | null
  subjectNames: string[]
  onConfirm: (subjectName: string) => void
  onCancel: () => void
}

/** Диалог ручного добавления слота: предмет из списка или новый вручную. */
export function AddSlotDialog({
  open,
  dayOfWeek,
  lessonNumber,
  subjectNames,
  onConfirm,
  onCancel
}: AddSlotDialogProps) {
  const [selected, setSelected] = useState<string>('')
  const [customName, setCustomName] = useState('')

  const isNew = selected === NEW_SUBJECT
  const effectiveName = isNew ? customName.trim() : selected
  const canConfirm = effectiveName.length > 0

  function reset() {
    setSelected('')
    setCustomName('')
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) {
          reset()
          onCancel()
        }
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Добавить урок</DialogTitle>
          <DialogDescription>
            {dayOfWeek != null && lessonNumber != null
              ? `${DAY_NAMES_FULL[dayOfWeek]}, урок №${lessonNumber}`
              : ''}
          </DialogDescription>
        </DialogHeader>

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
            <SelectItem value={NEW_SUBJECT}>Новый предмет…</SelectItem>
          </SelectContent>
        </Select>

        {isNew && (
          <Input
            autoFocus
            placeholder="Название нового предмета"
            value={customName}
            onChange={(e) => setCustomName(e.target.value)}
          />
        )}

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => {
              reset()
              onCancel()
            }}
          >
            Отмена
          </Button>
          <Button
            disabled={!canConfirm}
            onClick={() => {
              onConfirm(effectiveName)
              reset()
            }}
          >
            Добавить
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
