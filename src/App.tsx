import { useEffect, useMemo, useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { CalendarDays, ChevronLeft, ChevronRight, Download, Settings, X } from 'lucide-react'
import { db, resetAll, setMeta } from '@/db'
import { parseScheduleDocx } from '@/lib/parseSchedule'
import { parseKtpXls, type ParsedTopic } from '@/lib/parseKtp'
import { fillSlots } from '@/lib/fillSlots'
import { normalizeSubject } from '@/lib/normalize'
import { academicYearEnd, academicYearStart, addDaysISO, buildYearPlan, defaultHolidays, holidayOn, toISODate, weekMondayOf, type YearOccurrence } from '@/lib/yearPlan'
import { moveDay } from '@/lib/moveDay'
import { cn } from '@/lib/utils'
import type { CurriculumTopic, DayOverride, GigaChatSettings, Holiday, ScheduleSlot } from '@/types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import { ScheduleGrid, type WeekContext } from '@/components/ScheduleGrid'
import { KtpDialog } from '@/components/KtpDialog'
import { TopicsView } from '@/components/TopicsView'
import { AddSlotDialog } from '@/components/AddSlotDialog'
import { SettingsView } from '@/components/SettingsView'
import { YearView } from '@/components/YearView'
import { DayMoveDialog } from '@/components/DayMoveDialog'
import { DateMoveDialog } from '@/components/DateMoveDialog'
import { LessonDetailsDialog, formatDateRu, type LessonDetails } from '@/components/LessonDetailsDialog'
import { TopicEditDialog } from '@/components/TopicEditDialog'
import { ExportDialog } from '@/components/ExportDialog'
import { exportWeekSchedule, type ExportFormat, type ExportVariant } from '@/lib/exportSchedule'
import { GenerationProgress, type GenerationState } from '@/components/GenerationProgress'
import { generateSingleTopic, generateWeekTopics, ktpLessonsOfWeek, type GeneratedLessonItem } from '@/lib/lessonsService'
import { testConnection } from '@/lib/gigachatService'
import gigaLogo from '@/assets/gigachat_logo.svg'

interface StatusMessage {
  kind: 'success' | 'error' | 'info'
  text: string
}

type View = 'week' | 'year' | 'topics' | 'settings'

export default function App() {
  const slots = useLiveQuery(() => db.slots.toArray(), []) ?? []
  const topics =
    useLiveQuery(
      () => db.topics.toArray().then((ts) => ts.sort((a, b) => a.orderIndex - b.orderIndex)),
      []
    ) ?? []
  const holidays = useLiveQuery(() => db.holidays.toArray(), []) ?? []
  const moves = useLiveQuery(() => db.moves.toArray(), []) ?? []
  const pins = useLiveQuery(() => db.pins.toArray(), []) ?? []
  const dayOverrides = useLiveQuery(() => db.dayOverrides.toArray(), []) ?? []
  const scheduleUploaded =
    useLiveQuery(async () => (await db.meta.get('scheduleUploaded'))?.value === true, []) ?? false
  const schoolYearStart =
    useLiveQuery(async () => (await db.meta.get('schoolYearStart'))?.value as string | undefined, []) ??
    undefined
  const gigaSettings =
    useLiveQuery(
      async () => ((await db.meta.get('gigachat'))?.value as GigaChatSettings | undefined) ?? null,
      []
    ) ?? null
  /** Кнопки «GigaChat помоги» скрыты настройкой. */
  const gigaHidden = gigaSettings?.hidden === true

  // Ленивая инициализация настроек учебного года (первый запуск или после сброса).
  useEffect(() => {
    if (schoolYearStart !== undefined) return
    void (async () => {
      const start = academicYearStart()
      await setMeta('schoolYearStart', start)
      if ((await db.holidays.count()) === 0) {
        await db.holidays.bulkAdd(defaultHolidays(start))
      }
    })()
  }, [schoolYearStart])

  // Одноразовая миграция: у сгенерированных тем старой версии план урока хранился
  // в поле homework (Д/з). Переносим его в lessonPlan, Д/з очищаем.
  useEffect(() => {
    void db.topics
      .filter((t) => t.isGenerated === true && t.lessonPlan === undefined && t.homework !== '')
      .modify((t) => {
        t.lessonPlan = t.homework
        t.homework = ''
      })
  }, [])

  const [status, setStatus] = useState<StatusMessage | null>(null)
  const [pendingKtp, setPendingKtp] = useState<ParsedTopic[] | null>(null)
  const [resetOpen, setResetOpen] = useState(false)
  const [view, setView] = useState<View>('week')
  const [addSlotTarget, setAddSlotTarget] = useState<{
    dayOfWeek: number
    lessonNumber: number
  } | null>(null)
  // настройки — отдельное представление (view = settings)
  const [moveFromDay, setMoveFromDay] = useState<number | null>(null)
  const [moveDateFrom, setMoveDateFrom] = useState<string | null>(null)
  const [details, setDetails] = useState<LessonDetails | null>(null)
  const [detailsOcc, setDetailsOcc] = useState<YearOccurrence | null>(null)
  const [editTopic, setEditTopic] = useState<CurriculumTopic | null>(null)
  const [exportOpen, setExportOpen] = useState(false)
  const [gen, setGen] = useState<(GenerationState & { scope: 'week' | 'lesson' }) | null>(null)
  const genAbortRef = useRef<AbortController | null>(null)
  const genHideTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const subjectNames = useMemo(
    () => [...new Set(slots.map((s) => s.subjectName))].sort((a, b) => a.localeCompare(b, 'ru')),
    [slots]
  )
  // topicId → тема КТП (для промптов GigaChat и карточек).
  const topicById = useMemo(() => {
    const m = new Map<number, CurriculumTopic>()
    for (const t of topics) if (t.id != null) m.set(t.id, t)
    return m
  }, [topics])
  // Годовой план вычисляется в памяти и реактивно пересчитывается.
  const yearStart = schoolYearStart ?? academicYearStart()
  const plan = useMemo(
    () => buildYearPlan(slots, topics, holidays, yearStart, moves, pins, dayOverrides),
    [slots, topics, holidays, yearStart, moves, pins, dayOverrides]
  )

  // Выбранная неделя в представлении «Неделя».
  const minMonday = weekMondayOf(yearStart)
  const maxMonday = weekMondayOf(academicYearEnd(yearStart))
  const [weekStart, setWeekStart] = useState<string>(() => {
    const today = toISODate(new Date())
    const ys = academicYearStart()
    const base = today >= ys && today <= academicYearEnd(ys) ? today : ys
    return weekMondayOf(base)
  })
  // Смена учебного года → прыгаем на его первую неделю.
  useEffect(() => {
    if (weekStart < minMonday || weekStart > maxMonday) setWeekStart(minMonday)
  }, [minMonday, maxMonday, weekStart])

  const weekContext = useMemo<WeekContext>(() => {
    const dates = new Map<number, string>()
    for (let d = 1; d <= 7; d++) dates.set(d, addDaysISO(weekStart, d - 1))
    const inWeek = new Set(dates.values())
    // Ключ — `${slotId}|${date}`: один и тот же слот может попасть в неделю дважды
    // (свой день + дополнительный учебный день).
    const occBySlotDate = new Map<string, YearOccurrence>()
    for (const occ of plan.occurrences) {
      if (inWeek.has(occ.date)) occBySlotDate.set(`${occ.slotId}|${occ.date}`, occ)
    }
    return {
      dates,
      occBySlotDate,
      topicById,
      holidays,
      yearStart,
      yearEnd: academicYearEnd(yearStart),
      overrides: new Map(dayOverrides.map((o) => [o.date, o.asDayOfWeek]))
    }
  }, [weekStart, plan, topicById, holidays, yearStart, dayOverrides])

  /** Выгрузка расписания выбранной недели в DOCX/XLSX. */
  async function handleExport(format: ExportFormat, variant: ExportVariant) {
    setExportOpen(false)
    try {
      const filename = await exportWeekSchedule(plan.occurrences, topics, weekStart, format, variant)
      setStatus({ kind: 'success', text: `Расписание выгружено: ${filename}` })
    } catch (err) {
      setStatus({
        kind: 'error',
        text: `Ошибка выгрузки: ${err instanceof Error ? err.message : String(err)}`
      })
    }
  }

  // ---------- GigaChat: генерация тем ----------

  /** Автоскрытие тулбара прогресса после завершения/ошибки/отмены. */
  function scheduleGenHide() {
    if (genHideTimer.current) clearTimeout(genHideTimer.current)
    genHideTimer.current = setTimeout(() => {
      setGen((g) => (g && g.status !== 'running' ? null : g))
    }, 5000)
  }

  function requireGigaSettings(): GigaChatSettings | null {
    if (!gigaSettings || !gigaSettings.authorizationKey) {
      setView('settings')
      setStatus({
        kind: 'error',
        text: 'Сначала заполните настройки GigaChat: представление «Настройки» → раздел «GigaChat»'
      })
      return null
    }
    return gigaSettings
  }

  /** Запись результатов генерации.
   *  - Если на занятии уже есть тема КТП (item.topicId) — обновляем её «План урока»,
   *    новую тему не создаём (план строится по КТП).
   *  - Если темы нет — сгенерированная тема становится темой КТП (isGenerated)
   *    и закрепляется за занятием.
   *  Возвращает карту `${slotId}|${date}` → id темы. */
  async function applyGenerated(items: GeneratedLessonItem[]): Promise<Map<string, number>> {
    const created = new Map<string, number>()
    await db.transaction('rw', db.topics, db.pins, async () => {
      for (const item of items) {
        const occ = plan.occurrences.find((o) => o.slotId === item.slotId && o.date === item.date)
        if (!occ) continue
        const key = `${item.slotId}|${item.date}`
        if (item.topicId != null) {
          const existing = await db.topics.get(item.topicId)
          if (existing) {
            // План урока пишем в отдельное поле — домашнее задание из КТП не трогаем.
            await db.topics.update(item.topicId, { lessonPlan: item.description })
            created.set(key, item.topicId)
            continue
          }
        }
        const subjectTopics = await db.topics
          .where('subjectName')
          .equals(occ.subjectName)
          .toArray()
        const maxOrder = Math.max(-1, ...subjectTopics.map((t) => t.orderIndex))
        const topicId = await db.topics.add({
          subjectName: occ.subjectName,
          title: item.topic,
          hours: 1,
          homework: '',
          lessonPlan: item.description,
          orderIndex: maxOrder + 1,
          isGenerated: true
        })
        // Снимаем прежние закрепления этого занятия (по slotId; legacy — по дате и предмету).
        const dayPins = await db.pins.where('date').equals(item.date).toArray()
        for (const p of dayPins) {
          const sameSlot = p.slotId != null && p.slotId === item.slotId
          const legacySameSubject =
            p.slotId == null && subjectTopics.some((t) => t.id === p.topicId)
          if (sameSlot || legacySameSubject) await db.pins.delete(p.id!)
        }
        await db.pins.add({ topicId, date: item.date, slotId: item.slotId })
        created.set(key, topicId)
      }
    })
    return created
  }

  async function handleGenerateWeek() {
    const settings = requireGigaSettings()
    if (!settings) return
    const ctrl = new AbortController()
    genAbortRef.current = ctrl
    setGen({ scope: 'week', status: 'running', text: 'Генерация тем для недели…' })
    try {
      const result = await generateWeekTopics(plan.occurrences, weekStart, settings, ctrl.signal, topicById)
      if (result.status === 'no_lessons') {
        setGen({
          scope: 'week',
          status: 'error',
          text: 'На этой неделе нет занятий с темами КТП — загрузите КТП или выберите другую неделю'
        })
      } else {
        const created = await applyGenerated(result.items)
        const total = ktpLessonsOfWeek(plan.occurrences, weekStart, topicById).length
        setGen({
          scope: 'week',
          status: 'done',
          text:
            created.size < total
              ? `Готово, но GigaChat ответил не на всё: обновлено ${created.size} из ${total} занятий. Нажмите ещё раз, чтобы дополнить.`
              : `Готово! Планы уроков обновлены для занятий: ${created.size}`
        })
      }
    } catch (err) {
      setGen(
        ctrl.signal.aborted
          ? { scope: 'week', status: 'cancelled', text: 'Генерация отменена' }
          : {
              scope: 'week',
              status: 'error',
              text: `Ошибка: ${err instanceof Error ? err.message : String(err)}`
            }
      )
    } finally {
      scheduleGenHide()
    }
  }

  async function handleGenerateLesson(occ: YearOccurrence) {
    const settings = requireGigaSettings()
    if (!settings) return
    // Генерация только по теме из загруженного КТП (не по сгенерированной/отсутствующей).
    const ktpTopic = occ.topicId != null ? topicById.get(occ.topicId) : undefined
    if (!ktpTopic || ktpTopic.isGenerated) {
      setStatus({
        kind: 'error',
        text: 'План генерируется только по теме из загруженного КТП — сначала назначьте её в карточке урока'
      })
      return
    }
    const ctrl = new AbortController()
    genAbortRef.current = ctrl
    setGen({ scope: 'lesson', status: 'running', text: 'Генерация плана урока…' })
    try {
      const item = await generateSingleTopic(occ, settings, ctrl.signal, ktpTopic)
      const created = await applyGenerated([item])
      // План записался в карточку — обновляем открытый диалог, диалог не закрываем.
      const newTopicId = created.get(`${occ.slotId}|${occ.date}`)
      const newTopic = newTopicId != null ? await db.topics.get(newTopicId) : undefined
      if (newTopic) {
        setDetails((prev) =>
          prev?.type === 'lesson'
            ? { ...prev, topic: newTopic, topicDate: occ.date, hasSubjectTopics: true }
            : prev
        )
      }
      setGen({
        scope: 'lesson',
        status: 'done',
        text: 'Готово! План урока сгенерирован и записан в карточку занятия'
      })
    } catch (err) {
      setGen(
        ctrl.signal.aborted
          ? { scope: 'lesson', status: 'cancelled', text: 'Генерация отменена' }
          : {
              scope: 'lesson',
              status: 'error',
              text: `Ошибка: ${err instanceof Error ? err.message : String(err)}`
            }
      )
    } finally {
      scheduleGenHide()
    }
  }

  /** Сохранение плана урока из карточки (поле «План урока», отдельно от Д/з). */
  async function handleSavePlan(topicId: number, text: string) {
    await db.topics.update(topicId, { lessonPlan: text })
    setDetails((prev) =>
      prev?.type === 'lesson' && prev.topic
        ? { ...prev, topic: { ...prev.topic, lessonPlan: text } }
        : prev
    )
    setStatus({ kind: 'success', text: 'План урока сохранён' })
  }

  function handleCancelGeneration() {
    genAbortRef.current?.abort()
  }

  /** Проверка подключения из настроек: возвращает модели и автовыбранную модель. */
  async function handleTestGigaChat(
    settings: GigaChatSettings
  ): Promise<{ models: string[]; model: string }> {
    return testConnection(settings)
  }

  async function handleSaveGigaChat(settings: GigaChatSettings) {
    await setMeta('gigachat', settings)
    setStatus({ kind: 'success', text: 'Настройки GigaChat сохранены' })
  }

  function goCurrentWeek() {
    const today = toISODate(new Date())
    const base = today >= yearStart && today <= academicYearEnd(yearStart) ? today : yearStart
    setWeekStart(weekMondayOf(base))
  }

  async function handleScheduleFile(file: File) {
    try {
      const arrayBuffer = await file.arrayBuffer()
      const parsed = await parseScheduleDocx(arrayBuffer)
      if (parsed.length === 0) {
        setStatus({ kind: 'error', text: 'В таблице расписания не найдено ни одного занятия' })
        return
      }
      await db.transaction('rw', db.slots, db.meta, db.moves, db.pins, async () => {
        await db.slots.clear() // старое расписание удаляем
        await db.moves.clear() // переносы привязаны к старым слотам — тоже удаляем
        await db.pins.clear() // закрепления тем ссылаются на старые слоты — тоже удаляем
        await db.slots.bulkAdd(parsed)
        await setMeta('scheduleUploaded', true)
      })
      setStatus({ kind: 'success', text: `Расписание загружено: ${parsed.length} слотов` })
    } catch (err) {
      setStatus({
        kind: 'error',
        text: `Ошибка чтения расписания: ${err instanceof Error ? err.message : String(err)}`
      })
    }
  }

  async function handleKtpFile(file: File) {
    try {
      const arrayBuffer = await file.arrayBuffer()
      const parsed = parseKtpXls(arrayBuffer)
      if (parsed.length === 0) {
        setStatus({ kind: 'error', text: 'В файле КТП не найдено ни одной темы' })
        return
      }
      setPendingKtp(parsed) // открываем диалог выбора предмета
    } catch (err) {
      setStatus({
        kind: 'error',
        text: `Ошибка чтения КТП: ${err instanceof Error ? err.message : String(err)}`
      })
    }
  }

  async function handleKtpConfirm(selectedSubject: string) {
    const parsed = pendingKtp
    setPendingKtp(null)
    if (!parsed) return
    try {
      // Сохраняем темы; слоты предмета помечаем isLocked=true (защита от удаления).
      // Источник истины о темах — годовой план, а не slot.topicId.
      await db.transaction('rw', db.topics, db.slots, db.pins, async () => {
        // Повторная загрузка КТП по предмету заменяет его старые темы (без дублей).
        const oldTopicIds = (await db.topics
          .where('subjectName')
          .equals(selectedSubject)
          .primaryKeys()) as number[]
        await db.pins.where('topicId').anyOf(oldTopicIds).delete()
        await db.topics.where('subjectName').equals(selectedSubject).delete()
        const rows = parsed.map((t) => ({
          subjectName: selectedSubject,
          title: t.title,
          hours: t.hours,
          homework: t.homework,
          orderIndex: t.orderIndex
        }))
        const ids = await db.topics.bulkAdd(rows, { allKeys: true })
        const withIds = rows.map((r, i) => ({ ...r, id: ids[i] as number }))
        const { updatedSlots } = fillSlots(slots, withIds, selectedSubject)
        await db.slots.bulkPut(updatedSlots)
        // Закрепляем темы за датами: изменения расписания больше не сдвигают темы.
        const slotsAfter = slots.map((s) => updatedSlots.find((u) => u.id === s.id) ?? s)
        const allTopics = [
          ...topics.filter((t) => t.subjectName !== selectedSubject),
          ...withIds
        ]
        const otherPins = pins.filter((p) => !oldTopicIds.includes(p.topicId))
        const planAfter = buildYearPlan(slotsAfter, allTopics, holidays, yearStart, moves, otherPins, dayOverrides)
        const newPins = withIds
          .map((t) => {
            const occ = planAfter.occurrences.find((o) => o.topicId === t.id)
            return occ ? { topicId: t.id!, date: occ.date, slotId: occ.slotId } : null
          })
          .filter((p): p is { topicId: number; date: string; slotId: number } => p !== null)
        await db.pins.bulkAdd(newPins)
      })
      setStatus({
        kind: 'success',
        text: `КТП загружено: ${parsed.length} тем, привязано к предмету «${selectedSubject}»`
      })
    } catch (err) {
      setStatus({
        kind: 'error',
        text: `Ошибка привязки КТП: ${err instanceof Error ? err.message : String(err)}`
      })
    }
  }

  async function handleAddSlot(subjectName: string) {
    const target = addSlotTarget
    setAddSlotTarget(null)
    if (!target) return
    const normalized = normalizeSubject(subjectName)
    await db.slots.add({
      dayOfWeek: target.dayOfWeek as 1 | 2 | 3 | 4 | 5 | 6 | 7,
      lessonNumber: target.lessonNumber,
      subjectName: normalized,
      topicId: null,
      isLocked: false,
      isManual: true
    })
    setStatus({ kind: 'success', text: `Добавлен урок «${normalized}»` })
  }

  async function handleDeleteSlot(slot: (typeof slots)[number]) {
    if (slot.isLocked) return // заблокированные слоты защищены от удаления
    if (!window.confirm(`Удалить урок «${slot.subjectName}» из расписания?`)) return
    await db.slots.delete(slot.id!)
    setStatus({ kind: 'info', text: `Урок «${slot.subjectName}» удалён` })
  }

  async function handleYearSettingsSave(
    newYearStart: string,
    newHolidays: Holiday[],
    newOverrides: DayOverride[]
  ) {
    // Смена учебного года обесценивает закрепления тем и переносы —
    // они ссылаются на даты прошлого года.
    const yearChanged = newYearStart !== schoolYearStart
    await db.transaction(
      'rw',
      [db.meta, db.holidays, db.dayOverrides, db.pins, db.moves],
      async () => {
        await setMeta('schoolYearStart', newYearStart)
        if (yearChanged) {
          await db.pins.clear()
          await db.moves.clear()
        }
        await db.holidays.clear()
        await db.holidays.bulkAdd(
          newHolidays.map(({ title, startDate, endDate, kind }) => ({
            title,
            startDate,
            endDate,
            kind
          }))
        )
        await db.dayOverrides.clear()
        await db.dayOverrides.bulkAdd(
          newOverrides.map(({ date, asDayOfWeek }) => ({ date, asDayOfWeek }))
        )
      }
    )
    setStatus({ kind: 'success', text: 'Настройки учебного года сохранены' })
  }

  async function handleMoveDayConfirm(toDay: number) {
    const fromDay = moveFromDay
    setMoveFromDay(null)
    if (fromDay == null || fromDay === toDay) return
    const updated = moveDay(slots, fromDay, toDay)
    if (updated.length === 0) {
      setStatus({ kind: 'info', text: 'В исходном дне нет уроков для переноса' })
      return
    }
    await db.slots.bulkPut(updated)
    setStatus({ kind: 'success', text: `Перенесено уроков: ${updated.length}` })
  }

  function handleSlotClick(slot: ScheduleSlot, weekOcc?: YearOccurrence) {
    // Занятие выбранной недели для этого слота; если его нет (каникулы и т.п.) —
    // ближайшее будущее из годового плана (иначе — первое в году).
    const today = toISODate(new Date())
    const slotOccurrences = plan.occurrences.filter((o) => o.slotId === slot.id)
    const shown =
      weekOcc ??
      slotOccurrences.find((o) => o.date >= today) ??
      slotOccurrences[0] ??
      undefined
    setDetailsOcc(shown ?? null)
    const topic =
      shown?.topicId != null ? topics.find((t) => t.id === shown.topicId) : undefined
    setDetails({
      type: 'lesson',
      date: shown?.date,
      dayOfWeek: slot.dayOfWeek,
      lessonNumber: slot.lessonNumber,
      subjectName: slot.subjectName,
      isLocked: slot.isLocked,
      topic,
      topicDate: topic && shown ? shown.date : undefined,
      hasSubjectTopics: topics.some((t) => t.subjectName === slot.subjectName),
      movedFrom: shown?.movedFrom
    })
  }

  function handleLessonClick(occ: YearOccurrence) {
    const topic = occ.topicId != null ? topics.find((t) => t.id === occ.topicId) : undefined
    setDetailsOcc(occ)
    setDetails({
      type: 'lesson',
      date: occ.date,
      dayOfWeek: occ.dayOfWeek,
      lessonNumber: occ.lessonNumber,
      subjectName: occ.subjectName,
      topic,
      topicDate: topic ? occ.date : undefined,
      hasSubjectTopics: topics.some((t) => t.subjectName === occ.subjectName),
      movedFrom: occ.movedFrom
    })
  }

  /** Перенос занятия на другую дату (из годового календаря или диалога). */
  async function handleMoveLesson(occ: YearOccurrence, toDate: string) {
    const yearStart = schoolYearStart ?? academicYearStart()
    if (toDate === occ.date) return
    if (toDate < yearStart || toDate > academicYearEnd(yearStart)) {
      setStatus({ kind: 'error', text: 'Нельзя перенести занятие за пределы учебного года' })
      return
    }
    const targetHoliday = holidayOn(toDate, holidays)
    if (targetHoliday) {
      setStatus({
        kind: 'error',
        text: `Нельзя перенести занятие на ${toDate.split('-').reverse().join('.')}: ${targetHoliday.title}`
      })
      return
    }
    if (occ.moveId != null) {
      await db.moves.update(occ.moveId, { toDate })
    } else {
      await db.moves.add({ slotId: occ.slotId, fromDate: occ.movedFrom ?? occ.date, toDate })
    }
    // Закреплённые темы этого занятия переезжают вместе с ним.
    const subjectTopicIds = new Set(
      topics.filter((t) => t.subjectName === occ.subjectName).map((t) => t.id)
    )
    await db.transaction('rw', db.pins, async () => {
      for (const p of pins) {
        if (
          p.date === occ.date &&
          subjectTopicIds.has(p.topicId) &&
          (p.slotId == null || p.slotId === occ.slotId)
        ) {
          await db.pins.update(p.id!, { date: toDate })
        }
      }
    })
    setDetails(null)
    setDetailsOcc(null)
    setStatus({
      kind: 'success',
      text: `Занятие «${occ.subjectName}» перенесено на ${toDate.split('-').reverse().join('.')}`
    })
  }

  /** Отмена переноса: занятие возвращается на исходную дату по шаблону. */
  async function handleRevertMove(occ: YearOccurrence) {
    if (occ.moveId == null) return
    await db.moves.delete(occ.moveId)
    setDetails(null)
    setDetailsOcc(null)
    setStatus({ kind: 'info', text: `Перенос занятия «${occ.subjectName}» отменён` })
  }

  /** Перенос ВСЕХ занятий конкретной даты на другую дату. */
  async function handleMoveDateConfirm(toDate: string) {
    const fromDate = moveDateFrom
    if (fromDate == null || toDate === fromDate) return
    const yearStart = schoolYearStart ?? academicYearStart()
    if (toDate < yearStart || toDate > academicYearEnd(yearStart)) {
      setStatus({ kind: 'error', text: 'Нельзя перенести день за пределы учебного года' })
      return
    }
    const targetHoliday = holidayOn(toDate, holidays)
    if (targetHoliday) {
      setStatus({
        kind: 'error',
        text: `Нельзя перенести день на ${toDate.split('-').reverse().join('.')}: ${targetHoliday.title}`
      })
      return
    }
    const dayOccurrences = plan.occurrences.filter((o) => o.date === fromDate)
    if (dayOccurrences.length === 0) {
      setMoveDateFrom(null)
      return
    }
    await db.transaction('rw', db.moves, async () => {
      for (const occ of dayOccurrences) {
        if (occ.moveId != null) {
          await db.moves.update(occ.moveId, { toDate })
        } else {
          await db.moves.add({ slotId: occ.slotId, fromDate: occ.movedFrom ?? occ.date, toDate })
        }
      }
    })
    // Закреплённые темы дня переезжают вместе с занятиями.
    await db.pins.where('date').equals(fromDate).modify({ date: toDate })
    setMoveDateFrom(null)
    setStatus({
      kind: 'success',
      text: `День перенесён: ${dayOccurrences.length} занятий → ${toDate.split('-').reverse().join('.')}`
    })
  }

  function handleTopicClick(topic: CurriculumTopic) {
    setDetailsOcc(null)
    setDetails({
      type: 'topic',
      topic,
      topicDate: topic.id != null ? plan.topicDates.get(topic.id) : undefined
    })
  }

  /** Ручное назначение темы на занятие: закрепление за конкретной датой. */
  async function handlePinTopic(occ: YearOccurrence, topicId: number | null) {
    const subjectTopicIds = new Set(
      topics.filter((t) => t.subjectName === occ.subjectName).map((t) => t.id)
    )
    await db.transaction('rw', db.pins, async () => {
      // Снимаем закрепление текущей темы этого занятия (эта дата + этот урок).
      for (const p of pins) {
        if (
          p.date === occ.date &&
          subjectTopicIds.has(p.topicId) &&
          (p.slotId == null || p.slotId === occ.slotId)
        ) {
          await db.pins.delete(p.id!)
        }
      }
      if (topicId != null) {
        // Тема могла быть закреплена за другим занятием — снимаем прежнее закрепление.
        await db.pins.where('topicId').equals(topicId).delete()
        await db.pins.add({ topicId, date: occ.date, slotId: occ.slotId })
      }
    })
    const pinned = topicId != null ? topics.find((t) => t.id === topicId) : null
    setDetails(null)
    setDetailsOcc(null)
    setStatus({
      kind: 'success',
      text: pinned
        ? `Тема «${pinned.title}» назначена на ${occ.date.split('-').reverse().join('.')}`
        : 'Тема снята с занятия'
    })
  }

  /** Редактирование темы КТП (название, часы, домашнее задание). */
  async function handleTopicSave(topic: CurriculumTopic) {
    if (topic.id == null) return
    await db.topics.update(topic.id, {
      title: topic.title.trim(),
      hours: topic.hours,
      homework: topic.homework.trim()
    })
    setEditTopic(null)
    setStatus({ kind: 'success', text: 'Тема обновлена' })
  }

  async function handleReset() {
    setResetOpen(false)
    await resetAll()
    setStatus({ kind: 'info', text: 'Все данные удалены. Загрузите расписание заново.' })
  }

  /** Сброс закреплений тем: темы КТП заново размещаются по порядку с первого занятия. */
  async function handleRedistributeTopics() {
    if (
      !window.confirm(
        'Темы КТП будут заново размещены по порядку, начиная с первого занятия учебного года. ' +
          'Закрепления тем за датами (в том числе сделанные вручную) будут удалены. Продолжить?'
      )
    ) {
      return
    }
    await db.pins.clear()
    setStatus({ kind: 'success', text: 'Темы перераспределены по порядку с первого занятия' })
  }

  return (
    <div className="min-h-screen bg-muted/30">
      <header className="border-b bg-background">
        <div className="container flex h-14 items-center justify-between">
          <div className="flex items-center gap-2">
            <CalendarDays className="h-5 w-5 text-primary" />
            <h1 className="text-lg font-semibold">Умное расписание дефектолога</h1>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex rounded-md border">
              <Button
                variant={view === 'week' ? 'secondary' : 'ghost'}
                size="sm"
                className="rounded-r-none"
                onClick={() => setView('week')}
              >
                Неделя
              </Button>
              <Button
                variant={view === 'year' ? 'secondary' : 'ghost'}
                size="sm"
                className="rounded-none"
                onClick={() => setView('year')}
              >
                Учебный год
              </Button>
              <Button
                variant={view === 'topics' ? 'secondary' : 'ghost'}
                size="sm"
                className="rounded-none"
                onClick={() => setView('topics')}
              >
                Темы КТП
              </Button>
              <Button
                variant={view === 'settings' ? 'secondary' : 'ghost'}
                size="sm"
                className="rounded-l-none"
                onClick={() => setView('settings')}
              >
                <Settings /> Настройки
              </Button>
            </div>
          </div>
        </div>
      </header>

      <main className="container space-y-4 py-4">
        {status && (
          <div
            className={cn(
              'flex items-start justify-between gap-2 rounded-md border px-4 py-2 text-sm',
              status.kind === 'success' && 'border-green-300 bg-green-50 text-green-800',
              status.kind === 'error' && 'border-red-300 bg-red-50 text-red-800',
              status.kind === 'info' && 'border-blue-300 bg-blue-50 text-blue-800'
            )}
            role="status"
          >
            <span>{status.text}</span>
            <button
              type="button"
              aria-label="Закрыть уведомление"
              onClick={() => setStatus(null)}
              className="shrink-0 rounded p-0.5 opacity-60 transition-opacity hover:opacity-100"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        )}

        {!scheduleUploaded && slots.length === 0 && (
          <Card>
            <CardContent className="p-6 text-sm text-muted-foreground">
              Расписание ещё не загружено. Откройте настройки (шестерёнка справа вверху) и
              нажмите «Загрузить расписание (.docx)», выберите файл с таблицей уроков.
              Субботу и воскресенье можно заполнить вручную (кнопка «+» в пустой ячейке).
            </CardContent>
          </Card>
        )}

        {view === 'week' && (
          <Card>
            <CardContent className="space-y-3 p-4">
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={weekStart <= minMonday}
                  onClick={() => setWeekStart(addDaysISO(weekStart, -7))}
                >
                  <ChevronLeft /> Пред.
                </Button>
                <span className="text-sm font-medium">
                  Неделя: {formatDateRu(weekStart)} — {formatDateRu(addDaysISO(weekStart, 6))}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={weekStart >= maxMonday}
                  onClick={() => setWeekStart(addDaysISO(weekStart, 7))}
                >
                  След. <ChevronRight />
                </Button>
                <Input
                  type="date"
                  className="w-40"
                  min={minMonday}
                  max={academicYearEnd(yearStart)}
                  value={weekStart}
                  onChange={(e) => {
                    const v = e.target.value
                    if (!v) return
                    const monday = weekMondayOf(v)
                    setWeekStart(monday < minMonday ? minMonday : monday > maxMonday ? maxMonday : monday)
                  }}
                />
                <Button variant="ghost" size="sm" onClick={goCurrentWeek}>
                  Текущая неделя
                </Button>
                <Button variant="outline" size="sm" onClick={() => setExportOpen(true)}>
                  <Download /> Выгрузить расписание
                </Button>
                {!gigaHidden && (
                  <Button
                    variant="outline"
                    size="sm"
                    title="Сгенерировать планы уроков для занятий этой недели, по которым загружено КТП"
                    disabled={gen?.status === 'running'}
                    onClick={() => void handleGenerateWeek()}
                  >
                    <img src={gigaLogo} alt="GigaChat" className="h-4 w-4 rounded-sm" />
                    GigaChat помоги
                  </Button>
                )}
              </div>
              {gen?.scope === 'week' && (
                <GenerationProgress state={gen} onCancel={handleCancelGeneration} />
              )}
              <ScheduleGrid
                slots={slots}
                onAddSlot={(dayOfWeek, lessonNumber) =>
                  setAddSlotTarget({ dayOfWeek, lessonNumber })
                }
                onDeleteSlot={(slot) => void handleDeleteSlot(slot)}
                onSlotClick={handleSlotClick}
                onMoveDay={setMoveFromDay}
                week={weekContext}
              />
            </CardContent>
          </Card>
        )}
        {view === 'year' && (
          <YearView
            slots={slots}
            topics={topics}
            holidays={holidays}
            moves={moves}
            pins={pins}
            dayOverrides={dayOverrides}
            schoolYearStart={schoolYearStart ?? academicYearStart()}
            onLessonClick={handleLessonClick}
            onMoveLesson={(occ, toDate) => void handleMoveLesson(occ, toDate)}
            onMoveDay={setMoveDateFrom}
            onOpenWeek={(date) => {
              setWeekStart(weekMondayOf(date))
              setView('week')
            }}
          />
        )}
        {view === 'topics' && (
          <TopicsView
            topics={topics}
            topicDates={plan.topicDates}
            onTopicClick={handleTopicClick}
            onEditTopic={setEditTopic}
          />
        )}
        {view === 'settings' && (
          <SettingsView
            schoolYearStart={schoolYearStart ?? academicYearStart()}
            holidays={holidays}
            dayOverrides={dayOverrides}
            gigaSettings={gigaSettings}
            onTestGigaChat={handleTestGigaChat}
            onSaveGigaChat={(s) => void handleSaveGigaChat(s)}
            scheduleUploaded={scheduleUploaded}
            onScheduleFile={(f) => void handleScheduleFile(f)}
            onKtpFile={(f) => void handleKtpFile(f)}
            onResetRequest={() => setResetOpen(true)}
            onRedistributeTopics={() => void handleRedistributeTopics()}
            onSave={(y, h, o) => void handleYearSettingsSave(y, h, o)}
          />
        )}
      </main>

      <KtpDialog
        open={pendingKtp !== null}
        topics={pendingKtp ?? []}
        subjectNames={subjectNames}
        onConfirm={(subject) => void handleKtpConfirm(subject)}
        onCancel={() => setPendingKtp(null)}
      />

      <AddSlotDialog
        open={addSlotTarget !== null}
        dayOfWeek={addSlotTarget?.dayOfWeek ?? null}
        lessonNumber={addSlotTarget?.lessonNumber ?? null}
        subjectNames={subjectNames}
        onConfirm={(subject) => void handleAddSlot(subject)}
        onCancel={() => setAddSlotTarget(null)}
      />

      <DayMoveDialog
        fromDay={moveFromDay}
        daysWithSlots={new Set(slots.map((s) => s.dayOfWeek))}
        onConfirm={(toDay) => void handleMoveDayConfirm(toDay)}
        onCancel={() => setMoveFromDay(null)}
      />

      <DateMoveDialog
        fromDate={moveDateFrom}
        lessonsCount={
          moveDateFrom != null
            ? plan.occurrences.filter((o) => o.date === moveDateFrom).length
            : 0
        }
        minDate={schoolYearStart ?? academicYearStart()}
        maxDate={academicYearEnd(schoolYearStart ?? academicYearStart())}
        onConfirm={(toDate) => void handleMoveDateConfirm(toDate)}
        onCancel={() => setMoveDateFrom(null)}
      />

      <LessonDetailsDialog
        details={details}
        onClose={() => {
          setDetails(null)
          setDetailsOcc(null)
        }}
        onMoveLesson={
          detailsOcc ? (toDate) => void handleMoveLesson(detailsOcc, toDate) : undefined
        }
        onRevertMove={detailsOcc ? () => void handleRevertMove(detailsOcc) : undefined}
        minDate={schoolYearStart ?? academicYearStart()}
        maxDate={academicYearEnd(schoolYearStart ?? academicYearStart())}
        subjectTopics={
          detailsOcc
            ? topics
                .filter((t) => t.subjectName === detailsOcc.subjectName)
                .sort((a, b) => a.orderIndex - b.orderIndex)
            : undefined
        }
        topicDates={plan.topicDates}
        onPinTopic={detailsOcc ? (topicId) => void handlePinTopic(detailsOcc, topicId) : undefined}
        onEditTopic={(t) => {
          setDetails(null)
          setDetailsOcc(null)
          setEditTopic(t)
        }}
        onGenerateLesson={
          !gigaHidden &&
          detailsOcc?.topicId != null &&
          topicById.has(detailsOcc.topicId) &&
          !topicById.get(detailsOcc.topicId)!.isGenerated
            ? () => void handleGenerateLesson(detailsOcc)
            : undefined
        }
        generation={gen?.scope === 'lesson' ? gen : null}
        onCancelGeneration={handleCancelGeneration}
        onSavePlan={
          details?.type === 'lesson' && details.topic?.id != null
            ? (text) => void handleSavePlan(details.topic!.id!, text)
            : undefined
        }
      />

      <TopicEditDialog
        topic={editTopic}
        onSave={(t) => void handleTopicSave(t)}
        onCancel={() => setEditTopic(null)}
      />

      <ExportDialog
        weekStart={exportOpen ? weekStart : null}
        onConfirm={(format, variant) => void handleExport(format, variant)}
        onCancel={() => setExportOpen(false)}
      />

      <Dialog open={resetOpen} onOpenChange={setResetOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Сбросить все данные?</DialogTitle>
            <DialogDescription>
              Будут удалены расписание, темы КТП, переносы занятий, каникулы и настройки.
              Действие нельзя отменить.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setResetOpen(false)}>
              Отмена
            </Button>
            <Button variant="destructive" onClick={() => void handleReset()}>
              Удалить всё
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
