import { CheckCircle2, Loader2, XCircle } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'

export interface GenerationState {
  status: 'running' | 'done' | 'error' | 'cancelled'
  text: string
}

interface GenerationProgressProps {
  state: GenerationState
  onCancel: () => void
}

/** Тулбар прогресса генерации GigaChat: статус + отмена. Скрытие — на стороне родителя. */
export function GenerationProgress({ state, onCancel }: GenerationProgressProps) {
  return (
    <div
      role="status"
      className={cn(
        'flex items-center gap-2 rounded-md border px-3 py-2 text-sm',
        state.status === 'running' && 'border-primary/40 bg-primary/5',
        state.status === 'done' && 'border-green-300 bg-green-50 text-green-800',
        state.status === 'error' && 'border-red-300 bg-red-50 text-red-800',
        state.status === 'cancelled' && 'border-muted bg-muted/50 text-muted-foreground'
      )}
    >
      {state.status === 'running' && <Loader2 className="h-4 w-4 shrink-0 animate-spin text-primary" />}
      {state.status === 'done' && <CheckCircle2 className="h-4 w-4 shrink-0" />}
      {(state.status === 'error' || state.status === 'cancelled') && (
        <XCircle className="h-4 w-4 shrink-0" />
      )}
      <span className="min-w-0 flex-1 leading-tight">{state.text}</span>
      {state.status === 'running' && (
        <Button size="sm" variant="ghost" className="h-7 shrink-0" onClick={onCancel}>
          Отмена
        </Button>
      )}
    </div>
  )
}
