import { useMemo, useState } from 'react'
import { AlertTriangle, CheckCircle2, Pencil, Search } from 'lucide-react'
import type { CurriculumTopic } from '@/types'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { formatDateRu } from '@/components/LessonDetailsDialog'

interface TopicsViewProps {
  topics: CurriculumTopic[]
  /** topicId → дата проведения (ISO) из годового плана. */
  topicDates: Map<number, string>
  onTopicClick: (topic: CurriculumTopic) => void
  onEditTopic: (topic: CurriculumTopic) => void
}

interface SubjectGroup {
  subjectName: string
  topics: CurriculumTopic[]
  unplaced: CurriculumTopic[]
}

function TopicRow({
  topic,
  date,
  onTopicClick,
  onEditTopic
}: {
  topic: CurriculumTopic
  date?: string
  onTopicClick: (topic: CurriculumTopic) => void
  onEditTopic: (topic: CurriculumTopic) => void
}) {
  const unplaced = !date
  return (
    <li className="flex items-stretch gap-1">
      <button
        type="button"
        onClick={() => onTopicClick(topic)}
        className={
          unplaced
            ? 'flex w-full items-start gap-2 rounded-md border border-amber-300 bg-amber-50 p-2 text-left text-xs transition-colors hover:border-amber-500 hover:ring-1 hover:ring-amber-400/40 dark:bg-amber-950/30'
            : 'flex w-full items-start gap-2 rounded-md border p-2 text-left text-xs transition-colors hover:border-primary hover:ring-1 hover:ring-primary/40'
        }
      >
        {unplaced ? (
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
        ) : (
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-green-600" />
        )}
        <div className="min-w-0">
          <p className="font-medium leading-tight">{topic.title}</p>
          <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-muted-foreground">
            <Badge variant="outline" className="text-[10px]">
              {topic.hours} ч.
            </Badge>
            {topic.isGenerated && (
              <Badge variant="secondary" className="text-[10px]">
                GigaChat
              </Badge>
            )}
            {date ? (
              <span>{formatDateRu(date)}</span>
            ) : (
              <span className="font-medium text-amber-700 dark:text-amber-400">
                Не размещено — не хватает занятий в году
              </span>
            )}
            {topic.homework && <span className="leading-tight">Д/з: {topic.homework}</span>}
          </div>
        </div>
      </button>
      <button
        type="button"
        title="Редактировать тему"
        aria-label="Редактировать тему"
        onClick={() => onEditTopic(topic)}
        className="shrink-0 self-start rounded-md border p-1.5 text-muted-foreground transition-colors hover:border-primary hover:text-primary"
      >
        <Pencil className="h-3.5 w-3.5" />
      </button>
    </li>
  )
}

/** Отдельное представление «Темы КТП»: группировка по предметам, неразмещённые темы на виду. */
export function TopicsView({ topics, topicDates, onTopicClick, onEditTopic }: TopicsViewProps) {
  const [query, setQuery] = useState('')

  const groups = useMemo<SubjectGroup[]>(() => {
    const q = query.trim().toLowerCase()
    const filtered = q
      ? topics.filter(
          (t) =>
            t.title.toLowerCase().includes(q) ||
            t.homework.toLowerCase().includes(q) ||
            t.subjectName.toLowerCase().includes(q)
        )
      : topics
    const bySubject = new Map<string, CurriculumTopic[]>()
    for (const t of filtered) {
      const list = bySubject.get(t.subjectName) ?? []
      list.push(t)
      bySubject.set(t.subjectName, list)
    }
    return [...bySubject.entries()]
      .sort(([a], [b]) => a.localeCompare(b, 'ru'))
      .map(([subjectName, ts]) => {
        const sorted = [...ts].sort((a, b) => a.orderIndex - b.orderIndex)
        return {
          subjectName,
          topics: sorted,
          unplaced: sorted.filter((t) => t.id == null || !topicDates.has(t.id))
        }
      })
  }, [topics, topicDates, query])

  if (topics.length === 0) {
    return (
      <Card>
        <CardContent className="p-6 text-sm text-muted-foreground">
          Темы КТП ещё не загружены. Нажмите «Загрузить КТП (.xls)» и выберите предмет.
        </CardContent>
      </Card>
    )
  }

  const totalUnplaced = groups.reduce((sum, g) => sum + g.unplaced.length, 0)

  return (
    <div className="space-y-4">
      {totalUnplaced > 0 && (
        <div
          className="flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 px-4 py-2 text-sm text-amber-800 dark:bg-amber-950/30 dark:text-amber-300"
          role="alert"
        >
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            Не размещено тем: <strong>{totalUnplaced}</strong> — не хватает занятий в учебном
            году. Они показаны первыми в списках предметов ниже. Добавьте занятия в расписание
            или перенесите день, чтобы разместить их.
          </span>
        </div>
      )}

      <div className="relative max-w-md">
        <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          className="pl-8"
          placeholder="Поиск по темам, предметам, домашним заданиям…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>

      {groups.length === 0 && (
        <p className="text-sm text-muted-foreground">Ничего не найдено.</p>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        {groups.map((group) => {
          const placed = group.topics.length - group.unplaced.length
          // Неразмещённые темы — первыми, чтобы не приходилось их искать.
          const ordered = [
            ...group.unplaced,
            ...group.topics.filter((t) => !group.unplaced.includes(t))
          ]
          return (
            <Card key={group.subjectName}>
              <CardHeader>
                <CardTitle className="flex flex-wrap items-center gap-2 text-lg">
                  {group.subjectName}
                  {group.unplaced.length > 0 && (
                    <Badge className="bg-amber-100 text-amber-800 hover:bg-amber-100 dark:bg-amber-900 dark:text-amber-200">
                      <AlertTriangle className="mr-1 h-3 w-3" />
                      Не размещено: {group.unplaced.length}
                    </Badge>
                  )}
                </CardTitle>
                <CardDescription>
                  Размещено {placed} из {group.topics.length}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ul className="max-h-[480px] space-y-1.5 overflow-y-auto pr-1">
                  {ordered.map((topic) => (
                    <TopicRow
                      key={topic.id}
                      topic={topic}
                      date={topic.id != null ? topicDates.get(topic.id) : undefined}
                      onTopicClick={onTopicClick}
                      onEditTopic={onEditTopic}
                    />
                  ))}
                </ul>
              </CardContent>
            </Card>
          )
        })}
      </div>
    </div>
  )
}
