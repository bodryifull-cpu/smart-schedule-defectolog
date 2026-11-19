import { useEffect, useState } from 'react'
import { Lock, Pencil } from 'lucide-react'
import { DAY_NAMES_FULL, type CurriculumTopic } from '@/types'
import { isoDayOfWeek } from '@/lib/yearPlan'
import {
  Dialog,
  DialogContent,
  DialogDescription,
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
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { GenerationProgress, type GenerationState } from '@/components/GenerationProgress'
import { Textarea } from '@/components/ui/textarea'
import gigaLogo from '@/assets/gigachat_logo.svg'

export type LessonDetails =
  | {
      type: 'lesson'
      /** Дата конкретного занятия (годовой план) либо undefined для недельного слота. */
      date?: string
      dayOfWeek: number
      lessonNumber: number
      subjectName: string
      isLocked?: boolean
      /** Ближайшая назначенная тема (если есть). */
      topic?: CurriculumTopic
      topicDate?: string
      hasSubjectTopics: boolean
      /** Если занятие перенесено — исходная дата по шаблону. */
      movedFrom?: string
    }
  | { type: 'topic'; topic: CurriculumTopic; topicDate?: string }

interface LessonDetailsDialogProps {
  details: LessonDetails | null
  onClose: () => void
  /** Перенос занятия на другую дату (только для занятий годового плана). */
  onMoveLesson?: (toDate: string) => void
  onRevertMove?: () => void
  minDate?: string
  maxDate?: string
  /** Ручное назначение темы: все темы предмета и их текущие даты. */
  subjectTopics?: CurriculumTopic[]
  topicDates?: Map<number, string>
  onPinTopic?: (topicId: number | null) => void
  /** Редактирование темы (название, часы, ДЗ) прямо из диалога. */
  onEditTopic?: (topic: CurriculumTopic) => void
  /** Генерация темы для этого занятия через GigaChat. */
  onGenerateLesson?: () => void
  generation?: GenerationState | null
  onCancelGeneration?: () => void
  /** Сохранение плана урока (текст темы/описания). */
  onSavePlan?: (text: string) => void
}

export function formatDateRu(iso: string): string {
  const [y, m, d] = iso.split('-')
  return `${d}.${m}.${y}`
}

function TopicBlock({
  topic,
  topicDate,
  onEdit
}: {
  topic: CurriculumTopic
  topicDate?: string
  onEdit?: (topic: CurriculumTopic) => void
}) {
  return (
    <div className="space-y-1.5 rounded-md border p-3">
      <div className="flex flex-wrap items-center gap-2">
        <p className="font-medium leading-tight">{topic.title}</p>
        <Badge variant="outline">Тема №{topic.orderIndex + 1}</Badge>
        <Badge variant="outline">{topic.hours} ч.</Badge>
        {onEdit && (
          <Button
            variant="ghost"
            size="sm"
            className="ml-auto h-7 gap-1 px-2 text-xs"
            onClick={() => onEdit(topic)}
          >
            <Pencil className="h-3 w-3" /> Изменить
          </Button>
        )}
      </div>
      {topicDate && (
        <p className="text-sm text-muted-foreground">Запланировано на {formatDateRu(topicDate)}</p>
      )}
      <p className="text-sm leading-snug">
        <span className="text-muted-foreground">Домашнее задание: </span>
        {topic.homework || '—'}
      </p>
    </div>
  )
}

/** Блок переноса занятия на другую дату (внутри «Описания урока»). */
function MoveSection({
  details,
  onMoveLesson,
  onRevertMove,
  minDate,
  maxDate
}: {
  details: Extract<LessonDetails, { type: 'lesson' }>
  onMoveLesson?: (toDate: string) => void
  onRevertMove?: () => void
  minDate?: string
  maxDate?: string
}) {
  const [moveDate, setMoveDate] = useState('')
  if (!details.date || !onMoveLesson) return null
  return (
    <div className="space-y-2 border-t pt-3">
      {details.movedFrom && (
        <p className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          Перенесено с {formatDateRu(details.movedFrom)}
          {onRevertMove && (
            <Button variant="link" size="sm" className="h-auto p-0 text-xs" onClick={onRevertMove}>
              Отменить перенос
            </Button>
          )}
        </p>
      )}
      <div className="flex items-center gap-2">
        <Input
          type="date"
          className="w-44"
          min={minDate}
          max={maxDate}
          value={moveDate}
          onChange={(e) => setMoveDate(e.target.value)}
        />
        <Button
          size="sm"
          variant="outline"
          disabled={!moveDate || moveDate === details.date}
          onClick={() => onMoveLesson(moveDate)}
        >
          Перенести занятие
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        Переносится только это занятие, остальные по шаблону не меняются.
      </p>
    </div>
  )
}

/** Блок ручного назначения темы на занятие (в т.ч. неразмещённых тем). */
function TopicPinSection({
  details,
  subjectTopics,
  topicDates,
  onPinTopic
}: {
  details: Extract<LessonDetails, { type: 'lesson' }>
  subjectTopics: CurriculumTopic[]
  topicDates?: Map<number, string>
  onPinTopic: (topicId: number | null) => void
}) {
  if (!details.date || subjectTopics.length === 0) return null
  const currentId = details.topic?.id != null ? String(details.topic.id) : 'none'
  return (
    <div className="space-y-1.5 border-t pt-3">
      <label className="text-sm font-medium">Тема занятия</label>
      <Select
        value={currentId}
        onValueChange={(v) => onPinTopic(v === 'none' ? null : Number(v))}
      >
        <SelectTrigger>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="none">Без темы</SelectItem>
          {subjectTopics.map((t) => {
            const date = t.id != null ? topicDates?.get(t.id) : undefined
            const isCurrent = t.id != null && String(t.id) === currentId
            return (
              <SelectItem key={t.id} value={String(t.id)}>
                {t.orderIndex + 1}. {t.title}
                {isCurrent
                  ? ' (это занятие)'
                  : date
                    ? ` (уже: ${formatDateRu(date)})`
                    : ' (не размещена)'}
              </SelectItem>
            )
          })}
        </SelectContent>
      </Select>
      <p className="text-xs text-muted-foreground">
        Выбранная тема закрепится за этой датой и не будет сдвигаться при изменениях расписания.
      </p>
    </div>
  )
}

/** Текст плана урока темы. Fallback на homework — для тем, сгенерированных
 *  старой версией приложения (там план хранился в поле Д/з). */
function planOf(topic?: CurriculumTopic): string {
  if (!topic) return ''
  return topic.lessonPlan ?? (topic.isGenerated ? topic.homework : '')
}

/** Поле «План урока»: сюда записывается результат генерации, можно править вручную.
 *  Домашнее задание (homework) этим полем не изменяется. */
function PlanSection({
  topic,
  onSavePlan
}: {
  topic?: CurriculumTopic
  onSavePlan?: (text: string) => void
}) {
  const [text, setText] = useState(planOf(topic))

  useEffect(() => {
    setText(planOf(topic))
  }, [topic?.id, topic?.lessonPlan, topic?.homework])

  return (
    <div className="space-y-1.5 border-t pt-3">
      <label className="text-sm font-medium">План урока</label>
      <Textarea
        value={text}
        rows={4}
        maxLength={2000}
        placeholder="План урока появится здесь после генерации GigaChat — или заполните вручную"
        onChange={(e) => setText(e.target.value)}
      />
      {topic ? (
        <Button
          size="sm"
          variant="outline"
          disabled={!onSavePlan || text === planOf(topic)}
          onClick={() => onSavePlan?.(text)}
        >
          Сохранить план
        </Button>
      ) : (
        <p className="text-xs text-muted-foreground">
          Сначала назначьте тему из загруженного КТП (список выше) — тогда GigaChat
          сможет составить по ней план урока.
        </p>
      )}
    </div>
  )
}

/** Модальное «Описание урока» (и карточка темы КТП). */
export function LessonDetailsDialog({
  details,
  onClose,
  onMoveLesson,
  onRevertMove,
  minDate,
  maxDate,
  subjectTopics,
  topicDates,
  onPinTopic,
  onEditTopic,
  onGenerateLesson,
  generation,
  onCancelGeneration,
  onSavePlan
}: LessonDetailsDialogProps) {
  return (
    <Dialog open={details !== null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        {details?.type === 'lesson' && (
          <>
            <DialogHeader>
              <DialogTitle>Описание урока</DialogTitle>
              <DialogDescription>
                {details.date
                  ? `${DAY_NAMES_FULL[isoDayOfWeek(new Date(details.date + 'T00:00:00'))]}, ${formatDateRu(details.date)}`
                  : DAY_NAMES_FULL[details.dayOfWeek]}
                {' · '}{details.lessonNumber}-й урок дня
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="secondary" className="text-sm">
                  {details.subjectName}
                </Badge>
                {details.isLocked && (
                  <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                    <Lock className="h-3 w-3" /> защищён от удаления
                  </span>
                )}
              </div>
              {details.topic ? (
                <TopicBlock topic={details.topic} topicDate={details.topicDate} onEdit={onEditTopic} />
              ) : details.hasSubjectTopics ? (
                <p className="text-sm text-muted-foreground">
                  Тема на ближайшие занятия ещё не назначена — свободные темы закончились.
                </p>
              ) : (
                <p className="text-sm text-muted-foreground">
                  Для предмета «{details.subjectName}» темы КТП пока не привязаны. Загрузите КТП,
                  чтобы увидеть темы и домашние задания.
                </p>
              )}
              <MoveSection
                key={details.date}
                details={details}
                onMoveLesson={onMoveLesson}
                onRevertMove={onRevertMove}
                minDate={minDate}
                maxDate={maxDate}
              />
              {subjectTopics && onPinTopic && (
                <TopicPinSection
                  details={details}
                  subjectTopics={subjectTopics}
                  topicDates={topicDates}
                  onPinTopic={onPinTopic}
                />
              )}
              {onGenerateLesson && details.date && (
                <div className="border-t pt-3">
                  {generation?.status === 'running' ? (
                    <GenerationProgress state={generation} onCancel={onCancelGeneration ?? (() => {})} />
                  ) : (
                    <Button variant="outline" size="sm" onClick={onGenerateLesson}>
                      <img src={gigaLogo} alt="GigaChat" className="h-4 w-4 rounded-sm" />
                      GigaChat помоги
                    </Button>
                  )}
                </div>
              )}
              {details.date && <PlanSection topic={details.topic} onSavePlan={onSavePlan} />}
            </div>
          </>
        )}
        {details?.type === 'topic' && (
          <>
            <DialogHeader>
              <DialogTitle>Тема КТП</DialogTitle>
              <DialogDescription>{details.topic.subjectName}</DialogDescription>
            </DialogHeader>
            <TopicBlock topic={details.topic} topicDate={details.topicDate} onEdit={onEditTopic} />
            {!details.topicDate && (
              <p className="text-sm text-amber-600">
                Тема не размещена: не хватает занятий этого предмета в учебном году.
              </p>
            )}
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
