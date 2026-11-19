import { useEffect, useRef, useState } from 'react'
import type { CurriculumTopic } from '@/types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'

interface TopicEditDialogProps {
  topic: CurriculumTopic | null
  onSave: (topic: CurriculumTopic) => void
  onCancel: () => void
}

/** Диалог редактирования темы КТП: название, часы, домашнее задание. */
export function TopicEditDialog({ topic, onSave, onCancel }: TopicEditDialogProps) {
  const HOMEWORK_MAX = 500
  const [title, setTitle] = useState('')
  const [hours, setHours] = useState('1')
  const [homework, setHomework] = useState('')
  const homeworkRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    if (topic) {
      setTitle(topic.title)
      setHours(String(topic.hours))
      setHomework(topic.homework)
    }
  }, [topic])

  // Поле ДЗ растёт вместе с текстом (с разумным пределом по высоте).
  useEffect(() => {
    const el = homeworkRef.current
    if (el) {
      el.style.height = 'auto'
      el.style.height = `${Math.min(el.scrollHeight, 240)}px`
    }
  }, [homework, topic])

  const hoursNum = Number(hours)
  const valid = title.trim() !== '' && Number.isFinite(hoursNum) && hoursNum > 0

  return (
    <Dialog open={topic !== null} onOpenChange={(o) => !o && onCancel()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Редактировать тему</DialogTitle>
          <DialogDescription>{topic?.subjectName}</DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Название темы</label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Количество часов</label>
            <Input
              type="number"
              min={1}
              className="w-28"
              value={hours}
              onChange={(e) => setHours(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Домашнее задание</label>
            <Textarea
              ref={homeworkRef}
              value={homework}
              placeholder="—"
              rows={2}
              maxLength={HOMEWORK_MAX}
              className="resize-none overflow-y-auto"
              onChange={(e) => setHomework(e.target.value)}
            />
            <p className="text-right text-xs text-muted-foreground">
              {homework.length}/{HOMEWORK_MAX}
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onCancel}>
            Отмена
          </Button>
          <Button
            disabled={!valid}
            onClick={() =>
              topic && onSave({ ...topic, title, hours: hoursNum, homework })
            }
          >
            Сохранить
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
