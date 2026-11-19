import { useMemo, useState } from 'react'
import { MoveRight } from 'lucide-react'
import {
  DndContext,
  MouseSensor,
  TouchSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent
} from '@dnd-kit/core'
import {
  academicYearEnd,
  buildYearPlan,
  holidayOn,
  isoDayOfWeek,
  toISODate,
  type YearOccurrence
} from '@/lib/yearPlan'
import { cn } from '@/lib/utils'
import {
  DAY_NAMES,
  WEEK_DAYS,
  type CurriculumTopic,
  type Holiday,
  type LessonMove,
  type ScheduleSlot,
  type TopicPin,
  type DayOverride
} from '@/types'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'

const MONTH_NAMES_RU = [
  'Январь',
  'Февраль',
  'Март',
  'Апрель',
  'Май',
  'Июнь',
  'Июль',
  'Август',
  'Сентябрь',
  'Октябрь',
  'Ноябрь',
  'Декабрь'
]

interface YearViewProps {
  slots: ScheduleSlot[]
  topics: CurriculumTopic[]
  holidays: Holiday[]
  moves: LessonMove[]
  pins: TopicPin[]
  dayOverrides: DayOverride[]
  schoolYearStart: string
  onLessonClick: (occ: YearOccurrence) => void
  onMoveLesson: (occ: YearOccurrence, toDate: string) => void
  /** Перенос ВСЕХ занятий даты на другую дату. */
  onMoveDay: (date: string) => void
  /** Клик по дню (фон ячейки) — открыть эту неделю в представлении «Неделя». */
  onOpenWeek: (date: string) => void
}

function formatDate(iso: string): string {
  const [y, m, d] = iso.split('-')
  return `${d}.${m}.${y}`
}

/** Учебные месяцы: сентябрь … май с правильными календарными годами. */
function academicMonths(schoolYearStart: string): { year: number; month: number }[] {
  const y0 = Number(schoolYearStart.slice(0, 4))
  const months: { year: number; month: number }[] = []
  for (let m = 8; m <= 11; m++) months.push({ year: y0, month: m }) // сен–дек
  for (let m = 0; m <= 4; m++) months.push({ year: y0 + 1, month: m }) // янв–май
  return months
}

/** Занятие в ячейке дня: кликабельно (детали) и перетаскиваемо (перенос на другую дату). */
function LessonChip({
  occ,
  topic,
  manual,
  onLessonClick
}: {
  occ: YearOccurrence
  topic?: CurriculumTopic
  /** Слот добавлен вручную. */
  manual?: boolean
  onLessonClick: (occ: YearOccurrence) => void
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: `${occ.slotId}|${occ.date}`
  })
  return (
    <button
      ref={setNodeRef}
      type="button"
      {...listeners}
      {...attributes}
      onClick={(e) => {
        e.stopPropagation()
        onLessonClick(occ)
      }}
      style={
        transform
          ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` }
          : undefined
      }
      title={`${topic ? `${topic.title}${topic.homework ? ` — Д/з: ${topic.homework}` : ''}` : occ.subjectName} (перетащите на другой день, чтобы перенести)`}
      className={cn(
        'block w-full cursor-grab rounded border bg-background px-1 py-0.5 text-left text-[10px] leading-tight transition-colors hover:border-primary hover:ring-1 hover:ring-primary/40',
        isDragging && 'z-10 opacity-70',
        occ.movedFrom && 'border-dashed border-primary/60',
        // Ручной урок с темой КТП — синяя подсветка, без темы — фиолетовая.
        manual && topic != null && 'border-l-2 border-l-primary',
        manual && topic == null && 'border-l-2 border-l-violet-500 bg-violet-50/70 dark:bg-violet-950/30'
      )}
    >
      {occ.movedFrom && <MoveRight className="mr-0.5 inline h-2.5 w-2.5 text-primary" />}
      {topic && (
        <span className="font-medium text-muted-foreground">{topic.orderIndex + 1}.</span>
      )}{' '}
      <Badge variant="secondary" className="px-1 py-0 text-[10px]">
        {occ.subjectName}
      </Badge>
      {topic && <div className="mt-0.5 truncate">{topic.title}</div>}
    </button>
  )
}

/** Ячейка дня месяца — цель сброса при переносе занятия. */
function DayCell({
  date,
  holidays,
  lessons,
  topicById,
  slotById,
  onLessonClick,
  onMoveDay,
  onOpenWeek,
  overrideDow
}: {
  date: string
  holidays: Holiday[]
  lessons: YearOccurrence[]
  topicById: Map<number | undefined, CurriculumTopic>
  slotById: Map<number | undefined, ScheduleSlot>
  onLessonClick: (occ: YearOccurrence) => void
  onMoveDay: (date: string) => void
  onOpenWeek: (date: string) => void
  /** Если день — дополнительный учебный: чьё расписание действует (1..7). */
  overrideDow?: number
}) {
  const { setNodeRef, isOver } = useDroppable({ id: date })
  const day = Number(date.slice(8))
  const dow = isoDayOfWeek(new Date(date + 'T00:00:00'))
  const holiday = holidayOn(date, holidays)
  const isPublicHoliday = holiday?.kind === 'holiday'
  return (
    <div
      ref={setNodeRef}
      title={holiday ? `${holiday.title} (клик — открыть неделю)` : 'Клик — открыть неделю'}
      onClick={() => onOpenWeek(date)}
      className={cn(
        'group min-h-[92px] cursor-pointer rounded-md border p-1',
        holiday && !isPublicHoliday && 'border-amber-300 bg-amber-100 dark:bg-amber-950/40',
        isPublicHoliday && 'border-rose-300 bg-rose-100 dark:bg-rose-950/40',
        !holiday && dow >= 6 && 'bg-muted/50',
        !holiday && dow <= 5 && 'bg-card',
        isOver && 'ring-2 ring-primary'
      )}
    >
      <div
        className={cn(
          'flex items-center justify-between text-xs font-medium',
          dow >= 6 && !holiday && 'text-muted-foreground',
          holiday && !isPublicHoliday && 'text-amber-700 dark:text-amber-400',
          isPublicHoliday && 'text-rose-700 dark:text-rose-400'
        )}
      >
        <span>
          {day}
          {overrideDow != null && !holiday && (
            <span className="ml-1 text-[9px] font-normal text-primary">
              как {DAY_NAMES[overrideDow]}
            </span>
          )}
        </span>
        {lessons.length > 0 && (
          <button
            type="button"
            title="Перенести весь день на другую дату"
            onClick={(e) => {
              e.stopPropagation()
              onMoveDay(date)
            }}
            className="rounded p-0.5 text-muted-foreground opacity-0 transition-opacity hover:bg-primary/10 hover:text-primary focus:opacity-100 group-hover:opacity-100"
          >
            <MoveRight className="h-3 w-3" />
          </button>
        )}
      </div>
      <div className="mt-0.5 space-y-0.5">
        {lessons.map((occ) => (
          <LessonChip
            key={occ.slotId}
            occ={occ}
            topic={occ.topicId != null ? topicById.get(occ.topicId) : undefined}
            manual={slotById.get(occ.slotId)?.isManual === true}
            onLessonClick={onLessonClick}
          />
        ))}
      </div>
    </div>
  )
}

export function YearView({
  slots,
  topics,
  holidays,
  moves,
  pins,
  dayOverrides,
  schoolYearStart,
  onLessonClick,
  onMoveLesson,
  onMoveDay,
  onOpenWeek
}: YearViewProps) {
  const plan = useMemo(
    () => buildYearPlan(slots, topics, holidays, schoolYearStart, moves, pins, dayOverrides),
    [slots, topics, holidays, schoolYearStart, moves, pins, dayOverrides]
  )

  const months = useMemo(() => academicMonths(schoolYearStart), [schoolYearStart])
  const [monthIndex, setMonthIndex] = useState(0)
  const { year, month } = months[Math.min(monthIndex, months.length - 1)]

  const sensors = useSensors(
    // Мышь: перетаскивание после сдвига на 8px (отличие от клика).
    useSensor(MouseSensor, { activationConstraint: { distance: 8 } }),
    // Тач: перетаскивание только после удержания 1,5 с — свайп скроллит страницу.
    useSensor(TouchSensor, { activationConstraint: { delay: 1500, tolerance: 8 } })
  )

  const occurrencesByDate = useMemo(() => {
    const map = new Map<string, YearOccurrence[]>()
    for (const occ of plan.occurrences) {
      const list = map.get(occ.date) ?? []
      list.push(occ)
      map.set(occ.date, list)
    }
    return map
  }, [plan])

  const topicById = useMemo(() => new Map(topics.map((t) => [t.id, t])), [topics])
  const slotById = useMemo(() => new Map(slots.map((s) => [s.id, s])), [slots])
  const overrideByDate = useMemo(
    () => new Map(dayOverrides.map((o) => [o.date, o.asDayOfWeek])),
    [dayOverrides]
  )

  // Сетка месяца (неделя начинается с понедельника).
  const firstDay = new Date(year, month, 1)
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const leadingBlanks = isoDayOfWeek(firstDay) - 1
  const cells: (string | null)[] = [
    ...Array.from({ length: leadingBlanks }, () => null),
    ...Array.from({ length: daysInMonth }, (_, i) => toISODate(new Date(year, month, i + 1)))
  ]

  const monthHolidays = useMemo(
    () => holidays.filter((h) => cells.some((c) => c != null && h.startDate <= c && c <= h.endDate)),
    [holidays, cells]
  )

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (!over) return
    const toDate = String(over.id)
    const [slotId, fromDate] = String(active.id).split('|')
    if (toDate === fromDate) return
    const occ = plan.occurrences.find((o) => o.slotId === Number(slotId) && o.date === fromDate)
    if (occ) onMoveLesson(occ, toDate)
  }

  return (
    <div>
      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <div>
            <CardTitle className="text-lg">Учебный год</CardTitle>
            <CardDescription>
              {formatDate(schoolYearStart)} — {formatDate(academicYearEnd(schoolYearStart))}.
              Занятие можно перетащить на другой день.
            </CardDescription>
          </div>
          <Select value={String(monthIndex)} onValueChange={(v) => setMonthIndex(Number(v))}>
            <SelectTrigger className="w-44">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {months.map((m, i) => (
                <SelectItem key={`${m.year}-${m.month}`} value={String(i)}>
                  {MONTH_NAMES_RU[m.month]} {m.year}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </CardHeader>
        <CardContent>
          <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
            <div className="grid grid-cols-7 gap-1.5">
              {WEEK_DAYS.map((d) => (
                <div
                  key={d}
                  className={cn(
                    'py-1 text-center text-xs font-semibold',
                    d >= 6 && 'text-muted-foreground'
                  )}
                >
                  {DAY_NAMES[d]}
                </div>
              ))}
              {cells.map((date, i) => {
                if (date == null) return <div key={`blank-${i}`} />
                return (
                  <DayCell
                    key={date}
                    date={date}
                    holidays={holidays}
                    lessons={occurrencesByDate.get(date) ?? []}
                    topicById={topicById}
                    slotById={slotById}
                    onLessonClick={onLessonClick}
                    onMoveDay={onMoveDay}
                    onOpenWeek={onOpenWeek}
                    overrideDow={overrideByDate.get(date)}
                  />
                )
              })}
            </div>
          </DndContext>
          {monthHolidays.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
              {monthHolidays.map((h) => (
                <span key={h.id ?? h.title} className="inline-flex items-center gap-1.5">
                  <span
                    className={cn(
                      'inline-block h-3 w-3 rounded-sm border',
                      h.kind === 'holiday'
                        ? 'border-rose-300 bg-rose-100'
                        : 'border-amber-300 bg-amber-100'
                    )}
                  />
                  {h.title} (
                  {h.startDate === h.endDate
                    ? formatDate(h.startDate)
                    : `${formatDate(h.startDate)} — ${formatDate(h.endDate)}`}
                  )
                </span>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
