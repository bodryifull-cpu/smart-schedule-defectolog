import { useEffect, useRef, useState } from 'react'
import { FileSpreadsheet, FileText, ListOrdered, Loader2, Plus, RotateCcw, Trash2 } from 'lucide-react'
import { DEFAULT_GIGACHAT_SETTINGS } from '@/lib/gigachatService'
import { defaultHolidays } from '@/lib/yearPlan'
import {
  DAY_NAMES_FULL,
  WEEK_DAYS,
  type DayOverride,
  type GigaChatSettings,
  type Holiday,
  type HolidayKind,
  type Severity
} from '@/types'
import { cn } from '@/lib/utils'
import gigaLogo from '@/assets/gigachat_logo.svg'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'

type SettingsTab = 'year' | 'giga' | 'files'

const TABS: { id: SettingsTab; label: string }[] = [
  { id: 'year', label: 'Учебный год' },
  { id: 'giga', label: 'GigaChat' },
  { id: 'files', label: 'Файлы и данные' }
]

interface SettingsViewProps {
  schoolYearStart: string
  holidays: Holiday[]
  dayOverrides: DayOverride[]
  /** Настройки GigaChat (null — ещё не заданы). */
  gigaSettings: GigaChatSettings | null
  /** Проверка подключения: возвращает список моделей или бросает ошибку. */
  onTestGigaChat: (settings: GigaChatSettings) => Promise<{ models: string[]; model: string }>
  onSaveGigaChat: (settings: GigaChatSettings) => void
  /** Загружено ли расписание (кнопка КТП активна только после него). */
  scheduleUploaded: boolean
  onScheduleFile: (file: File) => void
  onKtpFile: (file: File) => void
  onResetRequest: () => void
  /** Сброс закреплений тем: повторное размещение тем КТП по порядку с первого занятия. */
  onRedistributeTopics: () => void
  onSave: (schoolYearStart: string, holidays: Holiday[], dayOverrides: DayOverride[]) => void
}

const MIN_YEAR = 2000
const MAX_YEAR = 2100

/** Варианты учебного года для выпадашки: «2026-2027» и т.д. */
const YEAR_OPTIONS = Array.from({ length: MAX_YEAR - MIN_YEAR + 1 }, (_, i) => MIN_YEAR + i)

/** Представление «Настройки»: вкладки «Учебный год», «GigaChat», «Файлы и данные». */
export function SettingsView({
  schoolYearStart,
  holidays,
  dayOverrides,
  gigaSettings,
  onTestGigaChat,
  onSaveGigaChat,
  scheduleUploaded,
  onScheduleFile,
  onKtpFile,
  onResetRequest,
  onRedistributeTopics,
  onSave
}: SettingsViewProps) {
  const [tab, setTab] = useState<SettingsTab>('year')
  const [year, setYear] = useState(schoolYearStart.slice(0, 4))
  const [rows, setRows] = useState<Holiday[]>(holidays)
  const [overrideRows, setOverrideRows] = useState<DayOverride[]>(dayOverrides)
  const [giga, setGiga] = useState<GigaChatSettings>({ ...DEFAULT_GIGACHAT_SETTINGS, ...gigaSettings })
  const [gigaTest, setGigaTest] = useState<{ status: 'idle' | 'running' | 'ok' | 'error'; text: string }>({
    status: 'idle',
    text: ''
  })
  const scheduleInputRef = useRef<HTMLInputElement>(null)
  const ktpInputRef = useRef<HTMLInputElement>(null)

  // Подтягиваем сохранённые настройки, если пришли позже (liveQuery).
  useEffect(() => {
    if (gigaSettings) setGiga({ ...DEFAULT_GIGACHAT_SETTINGS, ...gigaSettings })
  }, [gigaSettings])

  function updateGiga(patch: Partial<GigaChatSettings>) {
    setGiga((prev) => ({ ...prev, ...patch }))
  }

  async function handleTestGiga() {
    setGigaTest({ status: 'running', text: 'Проверяем подключение…' })
    try {
      const { models, model } = await onTestGigaChat(giga)
      const next = { ...giga, models, model }
      setGiga(next)
      onSaveGigaChat(next) // автовыбранную модель сохраняем сразу
      setGigaTest({
        status: 'ok',
        text: `Подключение успешно. Будет использоваться модель: ${model}`
      })
    } catch (err) {
      setGigaTest({
        status: 'error',
        text: `Ошибка подключения: ${err instanceof Error ? err.message : String(err)}`
      })
    }
  }

  const yearStart = `${year}-09-01`

  function updateRow(index: number, patch: Partial<Holiday>) {
    setRows((prev) => prev.map((r, i) => (i === index ? { ...r, ...patch } : r)))
  }

  const valid =
    rows.every(
      (r) =>
        r.title.trim() &&
        r.startDate &&
        r.endDate &&
        r.startDate <= r.endDate &&
        (r.kind === 'vacation' || r.startDate === r.endDate)
    ) &&
    overrideRows.every((o) => o.date !== '')

  function handleSave() {
    // Для праздников гарантируем startDate = endDate.
    const normalized = rows.map((r) =>
      r.kind === 'holiday' ? { ...r, endDate: r.startDate } : r
    )
    onSave(yearStart, normalized, overrideRows)
  }

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div className="flex gap-1 border-b">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={cn(
              '-mb-px border-b-2 px-4 py-2 text-sm font-medium transition-colors',
              tab === t.id
                ? 'border-primary text-foreground'
                : 'border-transparent text-muted-foreground hover:border-muted-foreground/40 hover:text-foreground'
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'files' && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Файлы и данные</CardTitle>
          </CardHeader>
          <CardContent>
            <input
              ref={scheduleInputRef}
              type="file"
              accept=".docx"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0]
                if (f) onScheduleFile(f)
                e.target.value = ''
              }}
            />
            <input
              ref={ktpInputRef}
              type="file"
              accept=".xls,.xlsx"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0]
                if (f) onKtpFile(f)
                e.target.value = ''
              }}
            />
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => scheduleInputRef.current?.click()}
              >
                <FileText /> Загрузить расписание (.docx)
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={!scheduleUploaded}
                title={scheduleUploaded ? undefined : 'Сначала загрузите расписание'}
                onClick={() => ktpInputRef.current?.click()}
              >
                <FileSpreadsheet /> Загрузить КТП (.xls)
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={!scheduleUploaded}
                title={
                  scheduleUploaded
                    ? 'Заново разместить темы КТП по порядку с первого занятия'
                    : 'Сначала загрузите расписание'
                }
                onClick={onRedistributeTopics}
              >
                <ListOrdered /> Перераспределить темы
              </Button>
              <Button type="button" variant="destructive" size="sm" onClick={onResetRequest}>
                <Trash2 /> Сбросить всё
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {tab === 'giga' && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <img src={gigaLogo} alt="GigaChat" className="h-5 w-5 rounded-sm" />
              GigaChat — планы уроков по КТП
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid gap-2 sm:grid-cols-2">
              <div className="space-y-1">
                <label className="text-sm font-medium">Client ID</label>
                <Input
                  placeholder="Client ID"
                  value={giga.clientId}
                  onChange={(e) => updateGiga({ clientId: e.target.value.trim() })}
                />
              </div>
              <div className="space-y-1">
                <label className="text-sm font-medium">Authorization Key</label>
                <Input
                  type="password"
                  placeholder="Ключ авторизации (Base64)"
                  value={giga.authorizationKey}
                  onChange={(e) => updateGiga({ authorizationKey: e.target.value.trim() })}
                />
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Select
                value={giga.scope}
                onValueChange={(v) => updateGiga({ scope: v as GigaChatSettings['scope'] })}
              >
                <SelectTrigger className="w-52">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="GIGACHAT_API_PERS">Персональный (PERS)</SelectItem>
                  <SelectItem value="GIGACHAT_API_B2B">Бизнес (B2B)</SelectItem>
                  <SelectItem value="GIGACHAT_API_CORP">Корпоративный (CORP)</SelectItem>
                </SelectContent>
              </Select>
              <Select
                value={giga.severity}
                onValueChange={(v) => updateGiga({ severity: v as Severity })}
              >
                <SelectTrigger className="w-52">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="mild">Лёгкая УО</SelectItem>
                  <SelectItem value="moderate">Умеренная УО</SelectItem>
                </SelectContent>
              </Select>
              <span className="text-xs text-muted-foreground">Модель: {giga.model} (авто)</span>
            </div>
            <label className="flex cursor-pointer items-center gap-2 text-sm">
              <input
                type="checkbox"
                className="h-4 w-4 rounded border-input accent-primary"
                checked={giga.hidden ?? false}
                onChange={(e) => updateGiga({ hidden: e.target.checked })}
              />
              Скрыть кнопку «GigaChat помоги» в расписании и уроках
            </label>
            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={gigaTest.status === 'running' || !giga.authorizationKey}
                onClick={() => void handleTestGiga()}
              >
                {gigaTest.status === 'running' && <Loader2 className="animate-spin" />}
                Проверить подключение
              </Button>
              <Button type="button" size="sm" onClick={() => onSaveGigaChat(giga)}>
                Сохранить GigaChat
              </Button>
              {gigaTest.text && (
                <span
                  className={
                    gigaTest.status === 'ok'
                      ? 'text-xs text-green-700'
                      : gigaTest.status === 'error'
                        ? 'text-xs text-destructive'
                        : 'text-xs text-muted-foreground'
                  }
                >
                  {gigaTest.text}
                </span>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {tab === 'year' && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Учебный год</CardTitle>
            <CardDescription>
              Учебный год длится с 1 сентября по 31 мая. Занятия в дни каникул и праздников
              исключаются из годового плана.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1">
              <label className="text-sm font-medium">Учебный год</label>
              <Select value={year} onValueChange={setYear}>
                <SelectTrigger className="w-40">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {YEAR_OPTIONS.map((y) => (
                    <SelectItem key={y} value={String(y)}>{`${y}-${y + 1}`}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-sm font-medium">Каникулы и праздники</label>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setRows(defaultHolidays(yearStart))}
                  >
                    <RotateCcw /> По умолчанию
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      setRows((prev) => [
                        ...prev,
                        { title: '', startDate: yearStart, endDate: yearStart, kind: 'vacation' }
                      ])
                    }
                  >
                    <Plus /> Добавить
                  </Button>
                </div>
              </div>

              {rows.length === 0 && (
                <p className="text-sm text-muted-foreground">Каникулы и праздники не заданы.</p>
              )}
              <div className="space-y-2">
                {rows.map((row, i) => (
                  <div key={i} className="flex flex-wrap items-center gap-2">
                    <Select
                      value={row.kind}
                      onValueChange={(v) => {
                        const kind = v as HolidayKind
                        updateRow(i, {
                          kind,
                          ...(kind === 'holiday' ? { endDate: row.startDate } : {})
                        })
                      }}
                    >
                      <SelectTrigger className="w-32">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="vacation">Каникулы</SelectItem>
                        <SelectItem value="holiday">Праздник</SelectItem>
                      </SelectContent>
                    </Select>
                    <Input
                      className="w-44"
                      placeholder="Название"
                      value={row.title}
                      onChange={(e) => updateRow(i, { title: e.target.value })}
                    />
                    <Input
                      type="date"
                      className="w-40"
                      value={row.startDate}
                      onChange={(e) =>
                        updateRow(i, {
                          startDate: e.target.value,
                          ...(row.kind === 'holiday' ? { endDate: e.target.value } : {})
                        })
                      }
                    />
                    {row.kind === 'vacation' && (
                      <>
                        <span className="text-muted-foreground">—</span>
                        <Input
                          type="date"
                          className="w-40"
                          value={row.endDate}
                          onChange={(e) => updateRow(i, { endDate: e.target.value })}
                        />
                      </>
                    )}
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      aria-label="Удалить период"
                      onClick={() => setRows((prev) => prev.filter((_, j) => j !== i))}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-sm font-medium">Изменения в расписании</label>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    setOverrideRows((prev) => [
                      ...prev,
                      { date: yearStart, asDayOfWeek: 1 }
                    ])
                  }
                >
                  <Plus /> Добавить
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Если в какой-то день уроки идут по расписанию другого дня недели — добавьте его
                здесь. Работает и для буднего дня, и для выходного: дата заполнится уроками
                выбранного дня (например, суббота 20.02 — по расписанию понедельника).
              </p>
              {overrideRows.length === 0 && (
                <p className="text-sm text-muted-foreground">Изменений нет.</p>
              )}
              <div className="space-y-2">
                {overrideRows.map((o, i) => (
                  <div key={i} className="flex flex-wrap items-center gap-2">
                    <Input
                      type="date"
                      className="w-40"
                      value={o.date}
                      onChange={(e) =>
                        setOverrideRows((prev) =>
                          prev.map((r, j) => (j === i ? { ...r, date: e.target.value } : r))
                        )
                      }
                    />
                    <span className="text-sm text-muted-foreground">по расписанию</span>
                    <Select
                      value={String(o.asDayOfWeek)}
                      onValueChange={(v) =>
                        setOverrideRows((prev) =>
                          prev.map((r, j) =>
                            j === i ? { ...r, asDayOfWeek: Number(v) as DayOverride['asDayOfWeek'] } : r
                          )
                        )
                      }
                    >
                      <SelectTrigger className="w-40">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {WEEK_DAYS.map((d) => (
                          <SelectItem key={d} value={String(d)}>
                            {DAY_NAMES_FULL[d]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      aria-label="Удалить изменение"
                      onClick={() => setOverrideRows((prev) => prev.filter((_, j) => j !== i))}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex justify-end">
              <Button disabled={!valid} onClick={handleSave}>
                Сохранить учебный год
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
