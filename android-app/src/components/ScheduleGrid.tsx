import { Fragment } from 'react'
import {
  DndContext,
  MouseSensor,
  TouchSensor,
  rectIntersection,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent
} from '@dnd-kit/core'
import { CSS } from '@dnd-kit/utilities'
import { ArrowLeftRight, Lock, MoveRight, Plus, X } from 'lucide-react'
import { db } from '@/db'
import { cn } from '@/lib/utils'
import { holidayOn, type YearOccurrence } from '@/lib/yearPlan'
import {
  DAY_NAMES,
  DAY_NAMES_FULL,
  WEEK_DAYS,
  type CurriculumTopic,
  type Holiday,
  type ScheduleSlot
} from '@/types'
import { Badge } from '@/components/ui/badge'

/** Контекст выбранной недели: конкретные даты и темы поверх недельного шаблона. */
export interface WeekContext {
  /** dayOfWeek (1..7) → дата ISO выбранной недели. */
  dates: Map<number, string>
  /** `${slotId}|${date}` → занятие годового плана (переносы учтены). */
  occBySlotDate: Map<string, YearOccurrence>
  topicById: Map<number | undefined, CurriculumTopic>
  holidays: Holiday[]
  /** Границы учебного года (ISO): даты вне их не содержат занятий. */
  yearStart: string
  yearEnd: string
  /** Дополнительные учебные дни: дата ISO → чьё расписание действует (1=Пн … 7=Вс). */
  overrides: Map<string, number>
}

interface ScheduleGridProps {
  slots: ScheduleSlot[]
  onAddSlot: (dayOfWeek: number, lessonNumber: number) => void
  onDeleteSlot: (slot: ScheduleSlot) => void
  onSlotClick: (slot: ScheduleSlot, occ?: YearOccurrence) => void
  onMoveDay: (fromDay: number) => void
  /** Если задан — в шапке дней показываются даты, в карточках — темы этой недели. */
  week?: WeekContext
}

function formatDayMonth(iso: string): string {
  const [, m, d] = iso.split('-')
  return `${d}.${m}`
}

/** Карточка урока: одновременно draggable и droppable (обмен при сбросе).
 *  Мышь: порог сдвига 8px (отличие от клика). Тач: долгое нажатие 1,5 с,
 *  короткий свайп остаётся скроллом страницы. */
function SlotCard({
  slot,
  dndId,
  occ,
  topic,
  onDelete,
  onClick
}: {
  slot: ScheduleSlot
  /** Уникальный id ячейки для DnD (слот может отображаться в нескольких колонках). */
  dndId: string
  occ?: YearOccurrence
  topic?: CurriculumTopic
  onDelete: (slot: ScheduleSlot) => void
  onClick: (slot: ScheduleSlot, occ?: YearOccurrence) => void
}) {
  const {
    attributes,
    listeners,
    setNodeRef: setDragRef,
    transform,
    isDragging
  } = useDraggable({ id: dndId })
  const { setNodeRef: setDropRef, isOver } = useDroppable({ id: dndId })

  return (
    <div
      ref={(el) => {
        setDragRef(el)
        setDropRef(el)
      }}
      style={{ transform: CSS.Translate.toString(transform) }}
      {...listeners}
      {...attributes}
      onClick={() => onClick(slot, occ)}
      title={topic ? `${topic.title}${topic.homework ? ` — Д/з: ${topic.homework}` : ''}` : undefined}
      className={cn(
        'group relative h-full min-h-[48px] cursor-grab select-none rounded-md border bg-card p-1.5 text-xs shadow-sm transition-colors active:cursor-grabbing',
        isDragging && 'z-30 opacity-60 shadow-lg ring-2 ring-ring',
        isOver && 'border-primary ring-2 ring-primary/50',
        // Синяя подсветка: привязан к КТП (замок) или ручной урок с темой.
        (slot.isLocked || (slot.isManual && topic != null)) && 'border-l-4 border-l-primary',
        // Ручной урок без темы — фиолетовая подсветка.
        slot.isManual && topic == null && 'border-l-4 border-l-violet-500 bg-violet-50/70 dark:bg-violet-950/30'
      )}
    >
      <div className="flex items-start justify-between gap-1">
        <Badge variant="secondary" className="max-w-full whitespace-normal break-words text-left">
          {slot.subjectName}
        </Badge>
        {slot.isLocked && <Lock className="h-3 w-3 shrink-0 text-primary" />}
      </div>
      {topic && (
        <p className="mt-1 line-clamp-2 leading-tight text-muted-foreground">
          <span className="font-medium">{topic.orderIndex + 1}.</span> {topic.title}
        </p>
      )}
      {occ?.movedFrom && (
        <p className="mt-0.5 flex items-center gap-0.5 text-[10px] text-primary">
          <MoveRight className="h-2.5 w-2.5" /> перенесено
        </p>
      )}
      {!slot.isLocked && (
        <button
          type="button"
          aria-label="Удалить урок"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation()
            onDelete(slot)
          }}
          className="touch-visible absolute -right-1.5 -top-1.5 hidden h-5 w-5 items-center justify-center rounded-full border bg-background text-muted-foreground shadow-sm hover:bg-destructive hover:text-destructive-foreground group-hover:flex"
        >
          <X className="h-3 w-3" />
        </button>
      )}
    </div>
  )
}

export function ScheduleGrid({ slots, onAddSlot, onDeleteSlot, onSlotClick, onMoveDay, week }: ScheduleGridProps) {
  const sensors = useSensors(
    // Мышь/стилус: перетаскивание начинается после сдвига на 8px (отличие от клика).
    useSensor(MouseSensor, { activationConstraint: { distance: 8 } }),
    // Тач: перетаскивание только после удержания 1,5 с — обычный свайп скроллит сетку.
    useSensor(TouchSensor, { activationConstraint: { delay: 1500, tolerance: 8 } })
  )

  const slotAt = (day: number, lesson: number) =>
    slots.find((s) => s.dayOfWeek === day && s.lessonNumber === lesson)

  // Импорт из файла даёт до 8 уроков; вручную можно добавить больше —
  // строки сетки подстраиваются под фактический максимум.
  const maxLesson = Math.max(8, ...slots.map((s) => s.lessonNumber))
  const lessonRows = Array.from({ length: maxLesson }, (_, i) => i + 1)

  async function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (!over || active.id === over.id) return
    // dndId имеет вид `${slotId}@${деньКолонки}` — слот может быть в нескольких колонках.
    const a = slots.find((s) => s.id === Number(String(active.id).split('@')[0]))
    const b = slots.find((s) => s.id === Number(String(over.id).split('@')[0]))
    if (!a || !b || a.id === b.id) return
    // Обмен СОДЕРЖИМОГО слотов; идентичность слотов (id, день, урок) сохраняется.
    await db.transaction('rw', db.slots, async () => {
      await db.slots.update(a.id!, {
        subjectName: b.subjectName,
        topicId: b.topicId,
        isLocked: b.isLocked,
        isManual: b.isManual ?? false
      })
      await db.slots.update(b.id!, {
        subjectName: a.subjectName,
        topicId: a.topicId,
        isLocked: a.isLocked,
        isManual: a.isManual ?? false
      })
    })
  }

  return (
    <DndContext sensors={sensors} collisionDetection={rectIntersection} onDragEnd={handleDragEnd}>
      <div className="overflow-x-auto">
        <div className="grid min-w-[640px] grid-cols-[40px_repeat(7,1fr)] gap-1 sm:min-w-[840px] sm:grid-cols-[48px_repeat(7,1fr)]">
          <div />
          {WEEK_DAYS.map((day) => {
            const date = week?.dates.get(day)
            const outOfYear =
              week != null && date != null && (date < week.yearStart || date > week.yearEnd)
            const holiday = date && week && !outOfYear ? holidayOn(date, week.holidays) : undefined
            const override = week != null && date != null ? week.overrides.get(date) : undefined
            return (
              <div
                key={day}
                title={
                  outOfYear
                    ? 'Вне учебного года'
                    : (holiday?.title ??
                      (override != null
                        ? `Дополнительный учебный день: по расписанию ${DAY_NAMES_FULL[override]}`
                        : undefined))
                }
                className={cn(
                  'group/day relative rounded-md bg-muted px-2 py-1.5 text-center text-sm font-semibold',
                  day >= 6 && 'text-muted-foreground',
                  outOfYear && 'opacity-50',
                  holiday?.kind === 'vacation' && 'bg-amber-100 text-amber-800 dark:bg-amber-950/40',
                  holiday?.kind === 'holiday' && 'bg-rose-100 text-rose-800 dark:bg-rose-950/40',
                  !holiday && override != null && 'bg-primary/10 text-primary'
                )}
              >
                {DAY_NAMES[day]}
                {date && (
                  <span className="ml-1 text-xs font-normal text-muted-foreground">
                    {formatDayMonth(date)}
                  </span>
                )}
                {override != null && !holiday && (
                  <div className="text-[10px] font-normal leading-tight text-primary">
                    как {DAY_NAMES[override]}
                  </div>
                )}
                <button
                  type="button"
                  title="Перенести день"
                  aria-label={`Перенести день ${DAY_NAMES[day]}`}
                  onClick={() => onMoveDay(day)}
                  className="touch-visible-block absolute right-1 top-1/2 hidden -translate-y-1/2 rounded p-0.5 text-muted-foreground hover:bg-background hover:text-primary group-hover/day:block"
                >
                  <ArrowLeftRight className="h-3.5 w-3.5" />
                </button>
              </div>
            )
          })}
          {lessonRows.map((lesson) => (
            <Fragment key={lesson}>
              <div className="flex items-center justify-center rounded-md bg-muted text-sm font-medium text-muted-foreground">
                {lesson}
              </div>
              {WEEK_DAYS.map((day) => {
                const date = week?.dates.get(day)
                const outOfYear =
                  week != null && date != null && (date < week.yearStart || date > week.yearEnd)
                if (outOfYear) {
                  // Учебный год 1 сен – 31 мая: до и после него занятий нет.
                  return (
                    <div
                      key={`${day}-${lesson}`}
                      title="Вне учебного года"
                      className="min-h-[48px] rounded-md bg-muted/30"
                    />
                  )
                }
                const holiday = week != null && date != null ? holidayOn(date, week.holidays) : undefined
                if (holiday) {
                  // Каникулы и праздничные дни: занятий нет.
                  return (
                    <div
                      key={`${day}-${lesson}`}
                      title={holiday.title}
                      className={cn(
                        'min-h-[48px] rounded-md',
                        holiday.kind === 'vacation'
                          ? 'bg-amber-50 dark:bg-amber-950/30'
                          : 'bg-rose-50 dark:bg-rose-950/30'
                      )}
                    />
                  )
                }
                // Дополнительный учебный день: колонка показывает расписание другого дня недели.
                const override = week != null && date != null ? week.overrides.get(date) : undefined
                const effDay = override ?? day
                const slot = slotAt(effDay, lesson)
                if (!slot) {
                  return (
                    <button
                      key={`${day}-${lesson}`}
                      type="button"
                      title="Добавить урок"
                      onClick={() => onAddSlot(effDay, lesson)}
                      className={cn(
                        'group/add relative flex min-h-[48px] items-center justify-center rounded-md border border-dashed text-muted-foreground/40 transition-colors hover:border-primary hover:text-primary',
                        day >= 6 && 'bg-muted/40'
                      )}
                    >
                      <span className="group-hover/add:invisible">—</span>
                      <Plus className="absolute h-4 w-4 opacity-0 transition-opacity group-hover/add:opacity-100" />
                    </button>
                  )
                }
                const occ =
                  week != null && date != null
                    ? week.occBySlotDate.get(`${slot.id}|${date}`)
                    : undefined
                return (
                  <SlotCard
                    key={`${day}-${lesson}-${slot.id}`}
                    slot={slot}
                    dndId={`${slot.id}@${day}`}
                    occ={occ}
                    topic={occ?.topicId != null ? week?.topicById.get(occ.topicId) : undefined}
                    onDelete={onDeleteSlot}
                    onClick={onSlotClick}
                  />
                )
              })}
            </Fragment>
          ))}
          {/* Строка добавления урока сверх лимита в 8: вручную можно добавить сколько угодно. */}
          <div className="flex items-center justify-center rounded-md bg-muted/50 text-xs text-muted-foreground">
            <Plus className="h-3.5 w-3.5" />
          </div>
          {WEEK_DAYS.map((day) => {
            const date = week?.dates.get(day)
            const override =
              week != null && date != null ? week.overrides.get(date) : undefined
            const effDay = override ?? day
            return (
              <button
                key={`add-row-${day}`}
                type="button"
                title={`Добавить урок №${maxLesson + 1} (${DAY_NAMES[effDay]})`}
                onClick={() => onAddSlot(effDay, maxLesson + 1)}
                className={cn(
                  'flex min-h-[36px] items-center justify-center rounded-md border border-dashed text-muted-foreground/40 transition-colors hover:border-primary hover:text-primary',
                  day >= 6 && 'bg-muted/40'
                )}
              >
                <Plus className="h-4 w-4" />
              </button>
            )
          })}
        </div>
      </div>
    </DndContext>
  )
}
