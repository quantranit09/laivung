import { useState } from "react"
import { Check, Lightbulb, Siren, X, ZoomIn } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog"
import { CHAPTERS, imageUrl, QUESTIONS, type Question } from "@/lib/questions"
import { cn } from "@/lib/utils"

export function CriticalBadge({ className }: { className?: string }) {
  return (
    <Badge className={cn("gap-1 border-transparent bg-destructive/12 text-destructive", className)}>
      <Siren className="size-3" /> Điểm liệt
    </Badge>
  )
}

export function QuestionMeta({ q, extra }: { q: Question; extra?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-2 text-sm">
      <span className="font-semibold tabular-nums">Câu {q.n}/{QUESTIONS.length}</span>
      <Badge variant="secondary">{CHAPTERS[q.c - 1].short}</Badge>
      {q.k && <CriticalBadge />}
      {extra}
    </div>
  )
}

interface Props {
  q: Question
  /** Phương án đang chọn (1-based) */
  choice?: number
  /** Hiện đáp án đúng/sai và mẹo */
  reveal?: boolean
  onChoose?: (i: number) => void
  meta?: React.ReactNode
  /** Thứ tự hiển thị các phương án (1-based, theo chỉ số gốc) */
  order?: number[]
  /** Nội dung chèn giữa các phương án và mẹo (vd. cảnh báo) */
  children?: React.ReactNode
}

export function QuestionView({ q, choice, reveal, onChoose, meta, order, children }: Props) {
  const shown = order?.length === q.o.length ? order : q.o.map((_, i) => i + 1)
  const [zoom, setZoom] = useState(false)
  return (
    <div className="space-y-4">
      {meta ?? <QuestionMeta q={q} />}
      <h2 className="text-[1.05rem] leading-relaxed font-semibold sm:text-lg">{q.q}</h2>

      {q.i && (
        <button
          type="button"
          onClick={() => setZoom(true)}
          className="group relative block w-full overflow-hidden rounded-xl border bg-white p-2"
        >
          <img src={imageUrl(q.n)} alt={`Hình câu ${q.n}`} className="mx-auto max-h-72 w-auto object-contain" />
          <span className="absolute right-2 bottom-2 rounded-md bg-black/55 p-1 text-white opacity-0 transition group-hover:opacity-100">
            <ZoomIn className="size-4" />
          </span>
        </button>
      )}

      <div className="grid gap-2.5" role="radiogroup">
        {shown.map((i, idx) => {
          const text = q.o[i - 1]
          const selected = choice === i
          const isAnswer = q.a === i
          const state = !reveal ? (selected ? "selected" : "idle") : isAnswer ? "correct" : selected ? "wrong" : "dim"
          return (
            <button
              key={i}
              type="button"
              role="radio"
              aria-checked={selected}
              disabled={!onChoose}
              onClick={() => onChoose?.(i)}
              className={cn(
                "flex w-full items-start gap-3 rounded-xl border-2 bg-card px-3.5 py-3 text-left text-[0.95rem] leading-snug transition",
                onChoose && "hover:border-primary/50 hover:bg-accent/60 active:scale-[0.995]",
                state === "selected" && "border-primary bg-primary/6",
                state === "correct" && "border-success bg-success/10",
                state === "wrong" && "border-destructive bg-destructive/8",
                state === "dim" && "opacity-55",
              )}
            >
              <span
                className={cn(
                  "mt-px flex size-6 shrink-0 items-center justify-center rounded-md border text-xs font-bold tabular-nums",
                  state === "selected" && "border-primary bg-primary text-primary-foreground",
                  state === "correct" && "border-success bg-success text-success-foreground",
                  state === "wrong" && "border-destructive bg-destructive text-white",
                )}
              >
                {state === "correct" ? <Check className="size-3.5" /> : state === "wrong" ? <X className="size-3.5" /> : idx + 1}
              </span>
              <span>{text}</span>
            </button>
          )
        })}
      </div>

      {children}

      {reveal && q.t && (
        <div className="flex gap-3 rounded-xl border border-warning/50 bg-warning/12 p-3.5 text-sm leading-relaxed">
          <Lightbulb className="mt-0.5 size-4 shrink-0 text-warning-foreground dark:text-warning" />
          <div className="whitespace-pre-line">
            <span className="font-semibold">Mẹo nhớ: </span>
            {q.t}
          </div>
        </div>
      )}

      <Dialog open={zoom} onOpenChange={setZoom}>
        <DialogContent className="max-w-[min(96vw,900px)] bg-white p-3 sm:max-w-[min(96vw,900px)]">
          <DialogTitle className="sr-only">Hình câu {q.n}</DialogTitle>
          <img src={imageUrl(q.n)} alt={`Hình câu ${q.n}`} className="w-full" />
        </DialogContent>
      </Dialog>
    </div>
  )
}
